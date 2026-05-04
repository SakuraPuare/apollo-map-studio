import type { ActivationResult, LicenseState } from './license-bridge';

const WEB_LICENSE_KEY = 'ams.webLicense.v1';
const WEB_TRIAL_DAYS = Number(import.meta.env.VITE_AMS_WEB_TRIAL_DAYS ?? 7);
const WEB_ACTIVATION_ENDPOINT = import.meta.env.VITE_AMS_WEB_LICENSE_ENDPOINT as string | undefined;

interface StoredWebLicense {
  trialStart: number;
  activation?: {
    license: NonNullable<LicenseState['license']>;
    expires: number;
    activatedAt: number;
  };
}

interface WebActivationResponse {
  ok: boolean;
  license?: NonNullable<LicenseState['license']>;
  expires?: number;
  errorCode?: ActivationResult['errorCode'];
  errorMessage?: string;
}

function nowMs() {
  return Date.now();
}

function createInitialRecord(): StoredWebLicense {
  return { trialStart: nowMs() };
}

function readRecord(): StoredWebLicense {
  try {
    const raw = localStorage.getItem(WEB_LICENSE_KEY);
    if (!raw) return createInitialRecord();
    const parsed = JSON.parse(raw) as Partial<StoredWebLicense>;
    if (typeof parsed.trialStart !== 'number') return createInitialRecord();
    return parsed as StoredWebLicense;
  } catch {
    return createInitialRecord();
  }
}

function writeRecord(record: StoredWebLicense) {
  localStorage.setItem(WEB_LICENSE_KEY, JSON.stringify(record));
}

function ensureRecord(): StoredWebLicense {
  const record = readRecord();
  writeRecord(record);
  return record;
}

function machineCode(): string {
  return 'WEB-BROWSER';
}

function buildTrialState(record: StoredWebLicense, now = nowMs()): LicenseState {
  const trialEnd = record.trialStart + WEB_TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = trialEnd - now;
  const hoursRemaining = Math.max(0, Math.ceil(remainingMs / (60 * 60 * 1000)));
  const expired = remainingMs <= 0;

  return {
    status: expired ? 'expired_trial' : 'trial',
    canEdit: !expired,
    machineCode: machineCode(),
    trialStart: record.trialStart,
    trialEnd,
    daysRemaining: expired ? 0 : Math.ceil(hoursRemaining / 24),
    hoursRemaining,
    license: null,
    checkedAt: now,
    reason: expired
      ? 'Web trial expired. Activate this browser session to keep editing.'
      : 'Web trial is managed locally in this browser.',
  };
}

function buildActivatedState(record: StoredWebLicense, now = nowMs()): LicenseState | null {
  if (!record.activation) return null;
  const { activation } = record;
  const expires = activation.expires;
  const remainingMs = expires === 0 ? Number.POSITIVE_INFINITY : expires - now;
  const expired = expires !== 0 && remainingMs <= 0;
  const hoursRemaining =
    expires === 0 ? null : Math.max(0, Math.ceil(remainingMs / (60 * 60 * 1000)));

  return {
    status: expired ? 'expired_license' : 'activated',
    canEdit: !expired,
    machineCode: machineCode(),
    trialStart: record.trialStart,
    trialEnd: record.trialStart + WEB_TRIAL_DAYS * 24 * 60 * 60 * 1000,
    daysRemaining: hoursRemaining === null ? null : Math.ceil(hoursRemaining / 24),
    hoursRemaining,
    license: activation.license,
    checkedAt: now,
    reason: expired
      ? 'Web license expired. Renew to continue editing.'
      : 'Web license activated for this browser.',
  };
}

async function requestWebActivation(code: string): Promise<WebActivationResponse> {
  if (!WEB_ACTIVATION_ENDPOINT) {
    return {
      ok: false,
      errorCode: 'unknown',
      errorMessage: 'Web activation endpoint is not configured. Set VITE_AMS_WEB_LICENSE_ENDPOINT.',
    };
  }

  const response = await fetch(WEB_ACTIVATION_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, machineCode: machineCode() }),
  });

  if (!response.ok) {
    return {
      ok: false,
      errorCode: 'unknown',
      errorMessage: `Activation server returned ${response.status}.`,
    };
  }

  return (await response.json()) as WebActivationResponse;
}

export const webLicenseProvider = {
  getState(): Promise<LicenseState> {
    const record = ensureRecord();
    return Promise.resolve(buildActivatedState(record) ?? buildTrialState(record));
  },

  getMachineCode(): Promise<string> {
    return Promise.resolve(machineCode());
  },

  async activate(code: string): Promise<ActivationResult> {
    const record = ensureRecord();
    const result = await requestWebActivation(code);
    if (!result.ok || !result.license) {
      return {
        ok: false,
        state: buildActivatedState(record) ?? buildTrialState(record),
        errorCode: result.errorCode ?? 'unknown',
        errorMessage: result.errorMessage ?? 'Activation failed.',
      };
    }

    const expires = result.expires ?? result.license.expires;
    const next: StoredWebLicense = {
      ...record,
      activation: {
        license: { ...result.license, expires },
        expires,
        activatedAt: nowMs(),
      },
    };
    writeRecord(next);

    return {
      ok: true,
      state: buildActivatedState(next) ?? buildTrialState(next),
    };
  },

  deactivate(): Promise<LicenseState> {
    const record = ensureRecord();
    const next: StoredWebLicense = { trialStart: record.trialStart };
    writeRecord(next);
    return Promise.resolve(buildTrialState(next));
  },

  onChange(_handler: (state: LicenseState) => void): () => void {
    return () => undefined;
  },
};
