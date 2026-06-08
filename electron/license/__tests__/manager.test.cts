import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import test, { afterEach, beforeEach } from 'node:test';

import type { ActivationResult, LicensePayload, LicenseState } from '../types.cjs';

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: NodeJS.Module | null, isMain: boolean): unknown;
};

interface ParsedTokenStub {
  payload: LicensePayload;
  verified: boolean;
}

interface StoredLicenseStub {
  payload: LicensePayload;
  token: string;
  storedAt: number;
  machineAtActivation: string;
  tampered: boolean;
  tamperedReason?: string;
}

type MachineHintStub = {
  code: string | null;
  tampered: boolean;
  tamperedReason?: string;
};

type LicenseManagerCtor = new () => {
  getState(): LicenseState;
  getMachineCode(): string;
  start(): void;
  stop(): void;
};

type LicenseManagerPrivate = InstanceType<LicenseManagerCtor> & {
  activate(code: unknown): ActivationResult;
  deactivate(): LicenseState;
  refresh(): LicenseState;
};

const loadCjs = createRequire(__filename);
const managerPath = loadCjs.resolve(path.resolve(__dirname, '..', 'manager.cjs'));
const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;

const MACHINE = 'A6N0-SMBW-ENSG-SDGT';
const OTHER_MACHINE = 'B6N0-SMBW-ENSG-SDGT';
const NOW = Date.parse('2026-06-01T00:00:00.000Z');
const TRIAL_START = NOW - 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

let dir = '';
let tokens: Map<string, ParsedTokenStub>;
let storageRecord: StoredLicenseStub | null;
let storageSaveError: Error | null;
let saveCalls: { token: string; payload: LicensePayload }[];
let clearCalls = 0;
let persistedHint: MachineHintStub;
let trustedNow = NOW;
let timeTampered = false;
let timeTamperedReason: string | undefined;
let ipcHandlers: Map<string, (...args: unknown[]) => unknown>;
let sentStates: LicenseState[];

function payload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    lic: 'LIC-MANAGER-001',
    machine: MACHINE,
    issued: NOW - DAY,
    expires: NOW + 30 * DAY,
    nonce: '0123456789abcdef0123456789abcdef',
    name: 'Test User',
    ...overrides,
  };
}

function registerToken(token: string, payloadValue: LicensePayload, verified = true): string {
  const normalized = token.trim().replace(/\s+/g, '');
  tokens.set(normalized, { payload: payloadValue, verified });
  return token;
}

function storedLicense(token: string, payloadValue: LicensePayload): StoredLicenseStub {
  return {
    payload: payloadValue,
    token: token.trim().replace(/\s+/g, ''),
    storedAt: NOW,
    machineAtActivation: payloadValue.machine,
    tampered: false,
  };
}

function loadManager(): LicenseManagerPrivate {
  delete loadCjs.cache[managerPath];
  const mod = loadCjs(managerPath) as { LicenseManager: LicenseManagerCtor };
  return new mod.LicenseManager() as LicenseManagerPrivate;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'apms-license-manager-'));
  tokens = new Map();
  storageRecord = null;
  storageSaveError = null;
  saveCalls = [];
  clearCalls = 0;
  persistedHint = { code: MACHINE, tampered: false };
  trustedNow = NOW;
  timeTampered = false;
  timeTamperedReason = undefined;
  ipcHandlers = new Map();
  sentStates = [];

  moduleWithLoad._load = function patchedLoad(
    request: string,
    parent: NodeJS.Module | null,
    isMain: boolean,
  ) {
    if (request === 'electron') {
      return {
        app: {
          getPath(name: string) {
            assert.equal(name, 'userData');
            return dir;
          },
          getAppPath() {
            return dir;
          },
        },
        BrowserWindow: {
          getAllWindows() {
            return [
              {
                isDestroyed() {
                  return false;
                },
                webContents: {
                  send(_channel: string, state: LicenseState) {
                    sentStates.push(state);
                  },
                },
              },
              {
                isDestroyed() {
                  return true;
                },
                webContents: {
                  send() {
                    throw new Error('destroyed windows must not receive license broadcasts');
                  },
                },
              },
            ];
          },
        },
        ipcMain: {
          handle(channel: string, handler: (...args: unknown[]) => unknown) {
            ipcHandlers.set(channel, handler);
          },
        },
      };
    }
    if (request === './machine-id.cjs') {
      return {
        computeMachineCode() {
          return {
            code: MACHINE,
            signals: ['test'],
            digestHex: 'a'.repeat(64),
          };
        },
        readPersistedMachineHint() {
          return persistedHint;
        },
      };
    }
    if (request === './time-guard.cjs') {
      return {
        TimeGuard: class MockTimeGuard {
          start(): void {
            // Test stub.
          }

          stop(): void {
            // Test stub.
          }

          trustedNow(): number {
            return trustedNow;
          }

          snapshot() {
            return {
              now: trustedNow,
              lastSeen: trustedNow,
              firstSeen: TRIAL_START,
              sessions: 1,
              tampered: timeTampered,
              tamperedReason: timeTamperedReason,
              suspiciousNow: false,
            };
          }
        },
      };
    }
    if (request === './storage.cjs') {
      return {
        LicenseStorage: class MockLicenseStorage {
          load(): StoredLicenseStub | null {
            return storageRecord;
          }

          save(token: string, payloadValue: LicensePayload): void {
            if (storageSaveError) throw storageSaveError;
            const normalized = token.trim().replace(/\s+/g, '');
            saveCalls.push({ token: normalized, payload: payloadValue });
            storageRecord = storedLicense(normalized, payloadValue);
          }

          clear(): void {
            clearCalls += 1;
            storageRecord = null;
          }
        },
      };
    }
    if (request === './crypto.cjs') {
      return {
        parseToken(token: string) {
          return tokens.get(token.trim().replace(/\s+/g, '')) ?? null;
        },
        verifyToken(parsed: ParsedTokenStub) {
          return parsed.verified;
        },
        safeEqual(a: string, b: string) {
          return a === b;
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
});

afterEach(() => {
  moduleWithLoad._load = originalLoad;
  delete loadCjs.cache[managerPath];
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('LicenseManager rejects malformed, unsigned, wrong-machine, and expired activations', () => {
  const manager = loadManager();
  registerToken('BAD_SIGNATURE', payload(), false);
  registerToken('WRONG_MACHINE', payload({ machine: OTHER_MACHINE }));
  registerToken('EXPIRED', payload({ expires: NOW - 1 }));

  assert.equal(manager.activate('').errorCode, 'invalid_format');
  assert.equal(manager.activate('x'.repeat(4097)).errorCode, 'invalid_format');
  assert.equal(manager.activate('NOT_A_TOKEN').errorCode, 'invalid_format');
  assert.equal(manager.activate('BAD_SIGNATURE').errorCode, 'invalid_signature');
  assert.equal(manager.activate('WRONG_MACHINE').errorCode, 'machine_mismatch');
  assert.equal(manager.activate('EXPIRED').errorCode, 'expired');
  assert.deepEqual(saveCalls, []);
});

test('LicenseManager blocks same-license expiry downgrades but accepts upgrades', () => {
  const manager = loadManager();
  const existingPayload = payload({ lic: 'LIC-REPLAY', expires: NOW + 10 * DAY });
  storageRecord = storedLicense('EXISTING', existingPayload);

  registerToken('OLDER', payload({ lic: 'LIC-REPLAY', expires: NOW + DAY }));
  const downgrade = manager.activate('OLDER');

  assert.equal(downgrade.ok, false);
  assert.equal(downgrade.errorCode, 'replay');
  assert.deepEqual(saveCalls, []);

  const upgradedPayload = payload({ lic: 'LIC-REPLAY', expires: NOW + 20 * DAY });
  registerToken('  UPGRADED\n', upgradedPayload);
  const upgrade = manager.activate('  UPGRADED\n');

  assert.equal(upgrade.ok, true);
  assert.equal(upgrade.state.status, 'activated');
  assert.deepEqual(saveCalls, [{ token: 'UPGRADED', payload: upgradedPayload }]);
  assert.equal(upgrade.state.license?.expires, upgradedPayload.expires);
});

test('LicenseManager reports storage write failures during activation', () => {
  const manager = loadManager();
  const license = payload();
  registerToken('VALID', license);
  storageSaveError = new Error('read only');

  const result = manager.activate('VALID');

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'storage_error');
  assert.deepEqual(saveCalls, []);
});

test('LicenseManager surfaces tampered machine hints before license storage', () => {
  const license = payload();
  registerToken('VALID', license);
  storageRecord = storedLicense('VALID', license);
  persistedHint = {
    code: null,
    tampered: true,
    tamperedReason: 'machine hint HMAC mismatch',
  };

  const manager = loadManager();
  const state = manager.getState();

  assert.equal(state.status, 'tampered');
  assert.equal(state.canEdit, false);
  assert.match(state.reason, /machine hint HMAC mismatch/);
});

test('LicenseManager surfaces tampered license storage', () => {
  storageRecord = {
    payload: payload(),
    token: 'CORRUPT',
    storedAt: NOW,
    machineAtActivation: MACHINE,
    tampered: true,
    tamperedReason: 'shadow disagrees with state',
  };

  const manager = loadManager();
  const state = manager.getState();

  assert.equal(state.status, 'tampered');
  assert.equal(state.canEdit, false);
  assert.match(state.reason, /shadow disagrees/);
});

test('LicenseManager computes invalid, machine-mismatch, expired, and perpetual stored states', () => {
  const invalidPayload = payload({ lic: 'LIC-INVALID' });
  registerToken('INVALID_STORED', invalidPayload, false);
  storageRecord = storedLicense('INVALID_STORED', invalidPayload);
  assert.equal(loadManager().getState().status, 'invalid');

  const wrongMachinePayload = payload({ lic: 'LIC-WRONG', machine: OTHER_MACHINE });
  registerToken('WRONG_STORED', wrongMachinePayload);
  storageRecord = storedLicense('WRONG_STORED', wrongMachinePayload);
  const mismatch = loadManager().getState();
  assert.equal(mismatch.status, 'machine_mismatch');
  assert.equal(mismatch.license?.id, wrongMachinePayload.lic);

  const expiredPayload = payload({ lic: 'LIC-EXPIRED', expires: NOW - 1 });
  registerToken('EXPIRED_STORED', expiredPayload);
  storageRecord = storedLicense('EXPIRED_STORED', expiredPayload);
  const expired = loadManager().getState();
  assert.equal(expired.status, 'expired_license');
  assert.equal(expired.canEdit, false);
  assert.equal(expired.daysRemaining, 0);

  const perpetualPayload = payload({ lic: 'LIC-PERPETUAL', expires: 0 });
  registerToken('PERPETUAL_STORED', perpetualPayload);
  storageRecord = storedLicense('PERPETUAL_STORED', perpetualPayload);
  const perpetual = loadManager().getState();
  assert.equal(perpetual.status, 'activated');
  assert.equal(perpetual.canEdit, true);
  assert.equal(perpetual.daysRemaining, null);
  assert.equal(perpetual.hoursRemaining, null);
});

test('LicenseManager start wires IPC handlers and broadcasts successful activations', () => {
  const manager = loadManager();
  manager.start();

  assert.deepEqual([...ipcHandlers.keys()].sort(), [
    'license:activate',
    'license:deactivate',
    'license:get-machine-code',
    'license:get-state',
  ]);

  const license = payload({ lic: 'LIC-IPC' });
  registerToken('IPC_VALID', license);
  const activate = ipcHandlers.get('license:activate');
  assert.ok(activate);

  const result = activate({}, 'IPC_VALID') as ActivationResult;

  assert.equal(result.ok, true);
  assert.equal(sentStates.length, 1);
  assert.equal(sentStates[0]?.license?.id, 'LIC-IPC');

  const deactivate = ipcHandlers.get('license:deactivate');
  assert.ok(deactivate);
  const deactivated = deactivate({}) as LicenseState;
  assert.equal(deactivated.status, 'trial');
  assert.equal(clearCalls, 1);
  assert.equal(sentStates.length, 2);

  manager.stop();
});
