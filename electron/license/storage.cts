/**
 * License blob storage. Three-way mirror with HMAC tamper detection.
 *
 *     userData/license.dat        — primary, AES-GCM encrypted token + meta
 *     userData/.lic-state.json    — JSON envelope (token hash + nonce + HMAC)
 *     userData/.lic-shadow.dat    — encrypted shadow copy of the above
 *
 * On read, all three are decoded and cross-checked. Mismatch → mark tampered
 * (the manager treats this as fall-back to expired-trial).
 *
 * On write, all three are written atomically (write-temp + rename) and only
 * declared "good" after every file has flushed.
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  aesDecrypt,
  aesEncrypt,
  getFileKey,
  hmacHex,
  getMacKey,
  sha256Hex,
  safeEqual,
} from './crypto.cjs';
import type { LicensePayload } from './types.cjs';

const PRIMARY = 'license.dat';
const STATE = '.lic-state.json';
const SHADOW = '.lic-shadow.dat';

interface PrimaryV1 {
  v: 1;
  /** Raw activation token string (APMS1.…). */
  token: string;
  /** Issuance time recorded at activation (= payload.issued). */
  storedAt: number;
  /** Exact machine code at activation time. */
  machineAtActivation: string;
}

interface StateV1 {
  v: 1;
  /** SHA-256 of the activation token. */
  tokenHash: string;
  /** Same as primary.machineAtActivation. */
  machineAtActivation: string;
  /** Activation time. */
  activatedAt: number;
  /** Random nonce so two activations with the same token differ on disk. */
  nonce: string;
  /** HMAC over (tokenHash + machineAtActivation + activatedAt + nonce). */
  mac: string;
}

function isHexString(value: unknown, length: number): value is string {
  return typeof value === 'string' && value.length === length && /^[a-fA-F0-9]+$/.test(value);
}

function isStateV1(value: unknown): value is StateV1 {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<StateV1>;
  const activatedAt = state.activatedAt;
  return (
    state.v === 1 &&
    isHexString(state.tokenHash, 64) &&
    typeof state.machineAtActivation === 'string' &&
    Number.isSafeInteger(activatedAt) &&
    typeof activatedAt === 'number' &&
    activatedAt >= 0 &&
    isHexString(state.nonce, 64) &&
    isHexString(state.mac, 64)
  );
}

export interface StoredLicense {
  payload: LicensePayload;
  token: string;
  storedAt: number;
  machineAtActivation: string;
  /** True if any cross-check disagreed — caller should treat as tampered. */
  tampered: boolean;
  tamperedReason?: string;
}

export class LicenseStorage {
  constructor(
    private readonly userDataDir: string,
    private readonly machineCode: string,
  ) {}

  hasAnything(): boolean {
    return [PRIMARY, STATE, SHADOW].some((f) => existsSync(path.join(this.userDataDir, f)));
  }

  /** Atomically persist all three mirrors. */
  save(token: string, payload: LicensePayload): void {
    const now = Date.now();
    const primary: PrimaryV1 = {
      v: 1,
      token,
      storedAt: now,
      machineAtActivation: this.machineCode,
    };
    const tokenHash = sha256Hex(token);
    const nonce = sha256Hex(`${now}|${tokenHash}|${this.machineCode}`);
    const stateBody: Omit<StateV1, 'mac'> = {
      v: 1,
      tokenHash,
      machineAtActivation: this.machineCode,
      activatedAt: now,
      nonce,
    };
    const mac = hmacHex(
      getMacKey(this.machineCode),
      tokenHash,
      this.machineCode,
      String(now),
      nonce,
    );
    const state: StateV1 = { ...stateBody, mac };

    this.writePrimary(primary);
    this.writeState(state);
    this.writeShadow(state);
    void payload; // keep parameter for future expansion (ABI surface)
  }

  load(): StoredLicense | null {
    if (!this.hasAnything()) return null;
    const primary = this.readPrimary();
    const state = this.readState();
    const shadow = this.readShadow();

    if (!primary || !state || !shadow) {
      return this.tampered('one or more mirror files missing/corrupt');
    }

    // Cross-check token hash.
    const computedHash = sha256Hex(primary.token);
    if (!safeEqual(computedHash, state.tokenHash)) {
      return this.tampered('token hash differs from state');
    }
    if (!safeEqual(state.tokenHash, shadow.tokenHash)) {
      return this.tampered('shadow disagrees with state');
    }
    if (!safeEqual(state.machineAtActivation, shadow.machineAtActivation)) {
      return this.tampered('shadow machine differs from state');
    }
    if (state.activatedAt !== shadow.activatedAt) {
      return this.tampered('shadow activatedAt differs from state');
    }

    // Verify HMAC on state.
    const expectedMac = hmacHex(
      getMacKey(this.machineCode),
      state.tokenHash,
      state.machineAtActivation,
      String(state.activatedAt),
      state.nonce,
    );
    if (!safeEqual(state.mac, expectedMac)) {
      return this.tampered('state HMAC mismatch');
    }

    // Decode token to payload (signature verification happens in manager).
    let payload: LicensePayload;
    try {
      const body = primary.token.split('.')[1] ?? '';
      const buf = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      payload = JSON.parse(buf.toString('utf8')) as LicensePayload;
    } catch {
      return this.tampered('token body unparseable');
    }

    return {
      payload,
      token: primary.token,
      storedAt: primary.storedAt,
      machineAtActivation: primary.machineAtActivation,
      tampered: false,
    };
  }

  clear(): void {
    for (const f of [PRIMARY, STATE, SHADOW]) {
      try {
        unlinkSync(path.join(this.userDataDir, f));
      } catch {
        // ignore
      }
    }
  }

  // ─── File helpers ─────────────────────────────────────────────────────

  private writePrimary(p: PrimaryV1): void {
    const aad = Buffer.from('apms.primary.v1', 'utf8');
    const enc = aesEncrypt(
      getFileKey(this.machineCode, 'primary'),
      Buffer.from(JSON.stringify(p), 'utf8'),
      aad,
    );
    const mac = hmacHex(getMacKey(this.machineCode), enc);
    const out = Buffer.concat([Buffer.from(`${mac}\n`, 'utf8'), enc]);
    this.atomicWrite(PRIMARY, out);
  }

  private writeShadow(s: StateV1): void {
    const aad = Buffer.from('apms.shadow.v1', 'utf8');
    const enc = aesEncrypt(
      getFileKey(this.machineCode, 'shadow'),
      Buffer.from(JSON.stringify(s), 'utf8'),
      aad,
    );
    const mac = hmacHex(getMacKey(this.machineCode), enc);
    const out = Buffer.concat([Buffer.from(`${mac}\n`, 'utf8'), enc]);
    this.atomicWrite(SHADOW, out);
  }

  private writeState(s: StateV1): void {
    // The state file is *plaintext JSON* on purpose — easy to inspect for
    // support, integrity is HMAC-protected. The token hash is a hash, not
    // the token itself, so reading this file does not leak credentials.
    this.atomicWrite(STATE, Buffer.from(JSON.stringify(s, null, 2), 'utf8'));
  }

  private readPrimary(): PrimaryV1 | null {
    try {
      const raw = readFileSync(path.join(this.userDataDir, PRIMARY));
      const nl = raw.indexOf(0x0a);
      if (nl < 0) return null;
      const mac = raw.subarray(0, nl).toString('utf8');
      const enc = raw.subarray(nl + 1);
      if (!safeEqual(mac, hmacHex(getMacKey(this.machineCode), enc))) return null;
      const aad = Buffer.from('apms.primary.v1', 'utf8');
      const pt = aesDecrypt(getFileKey(this.machineCode, 'primary'), enc, aad);
      if (!pt) return null;
      const parsed = JSON.parse(pt.toString('utf8')) as PrimaryV1;
      return parsed.v === 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  private readShadow(): StateV1 | null {
    try {
      const raw = readFileSync(path.join(this.userDataDir, SHADOW));
      const nl = raw.indexOf(0x0a);
      if (nl < 0) return null;
      const mac = raw.subarray(0, nl).toString('utf8');
      const enc = raw.subarray(nl + 1);
      if (!safeEqual(mac, hmacHex(getMacKey(this.machineCode), enc))) return null;
      const aad = Buffer.from('apms.shadow.v1', 'utf8');
      const pt = aesDecrypt(getFileKey(this.machineCode, 'shadow'), enc, aad);
      if (!pt) return null;
      const parsed = JSON.parse(pt.toString('utf8')) as unknown;
      return isStateV1(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private readState(): StateV1 | null {
    try {
      const raw = readFileSync(path.join(this.userDataDir, STATE), 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return isStateV1(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private atomicWrite(name: string, data: Buffer): void {
    const final = path.join(this.userDataDir, name);
    const tmp = `${final}.tmp-${process.pid}`;
    writeFileSync(tmp, data, { mode: 0o600 });
    renameSync(tmp, final);
  }

  private tampered(reason: string): StoredLicense {
    return {
      payload: {
        v: 1,
        lic: '',
        machine: '',
        issued: 0,
        expires: 0,
        nonce: '',
      },
      token: '',
      storedAt: 0,
      machineAtActivation: '',
      tampered: true,
      tamperedReason: reason,
    };
  }
}
