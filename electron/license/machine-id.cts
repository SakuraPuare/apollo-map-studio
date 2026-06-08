/**
 * Machine fingerprint — a 16-character base32 code that identifies a host
 * with reasonable stability across reboots, kernel upgrades, and routine
 * hardware swaps.
 *
 * Strategy:
 *   1. Collect several stable signals: first non-virtual MAC, CPU model,
 *      arch, total RAM (rounded), platform, OS release, hostname, plus
 *      best-effort disk/volume serial via per-platform commands.
 *   2. Hash via HMAC-SHA256 keyed on APP_PEPPER so the same hardware on
 *      different products yields different codes.
 *   3. Emit 80 bits of base32 (Crockford-style) → 16 grouped characters
 *      (`XXXX-XXXX-XXXX-XXXX`). 80 bits is ample for non-collision.
 *
 * The first-seen result is persisted on disk under userData/.lic-machine.dat
 * as a soft drift hint. The hint is tamper-evident but not secret; license
 * binding is still enforced by the signed token and encrypted license state.
 */

import { execFileSync } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces, cpus, totalmem, platform, release, hostname, arch } from 'node:os';
import path from 'node:path';

import { APP_PEPPER } from './public-key.cjs';

const CROCKFORD = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789'; // no I, L, O, U
const SAFE_TIMEOUT_MS = 1500;
const MACHINE_CODE_RE = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/;
const HINT_DOMAIN = 'apms.machine-hint.v1';

// ─── Public API ─────────────────────────────────────────────────────────

let cached: MachineCodeResult | null = null;

export interface MachineCodeResult {
  code: string;
  /** Source signals actually used (for diagnostics — never logged). */
  signals: string[];
  /** Raw 32-byte HMAC digest for downstream HKDF derivation. */
  digestHex: string;
}

export interface PersistedMachineHint {
  code: string | null;
  tampered: boolean;
  tamperedReason?: string;
}

/**
 * Compute the machine code. Subsequent calls return the in-memory cached
 * value. Pass `userDataDir` so we can persist the first-seen value and
 * detect future drift.
 */
export function computeMachineCode(userDataDir: string): MachineCodeResult {
  if (cached) {
    persistMachineHint(userDataDir, cached.code);
    return {
      code: cached.code,
      signals: [...cached.signals],
      digestHex: cached.digestHex,
    };
  }
  const signals = collectSignals();
  const ikm = signals.join('||');
  const digest = createHmac('sha256', APP_PEPPER).update(ikm).digest();
  const code = encodeBase32(digest.subarray(0, 10));
  const result = {
    code,
    signals: signals.map((s) => s.split(':')[0] ?? ''),
    digestHex: digest.toString('hex'),
  };
  cached = result;

  persistMachineHint(userDataDir, code);

  return result;
}

/**
 * Read a previously-persisted machine code hint without re-deriving. Used
 * when we want to detect changes in collected signals (e.g. an attacker
 * spoofing one source) — the persisted hint is the *first* code we ever
 * saw on this device.
 */
export function readPersistedHint(userDataDir: string): string | null {
  const hint = readPersistedMachineHint(userDataDir);
  return hint.tampered ? null : hint.code;
}

/**
 * Read a previously-persisted machine code hint without re-deriving. Legacy
 * raw hints are accepted for migration; new hints include an HMAC envelope so
 * edits can be surfaced as tampering instead of being silently ignored.
 */
export function readPersistedMachineHint(userDataDir: string): PersistedMachineHint {
  try {
    const hintPath = path.join(userDataDir, '.lic-machine.dat');
    if (!existsSync(hintPath)) return { code: null, tampered: false };
    const raw = readFileSync(hintPath, 'utf8').trim();
    return parsePersistedMachineHint(raw);
  } catch {
    return { code: null, tampered: true, tamperedReason: 'machine hint unreadable' };
  }
}

function persistMachineHint(userDataDir: string, code: string): void {
  try {
    const hintPath = path.join(userDataDir, '.lic-machine.dat');
    if (!existsSync(hintPath)) {
      writeFileSync(hintPath, `${code}\n${machineHintMac(code)}\n`, { mode: 0o600 });
    }
  } catch {
    // Non-fatal — the in-memory cache still works.
  }
}

function parsePersistedMachineHint(raw: string): PersistedMachineHint {
  if (!raw) {
    return { code: null, tampered: true, tamperedReason: 'machine hint is empty' };
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 1) {
    const legacyCode = lines[0] ?? '';
    if (!MACHINE_CODE_RE.test(legacyCode)) {
      return { code: null, tampered: true, tamperedReason: 'machine hint malformed' };
    }
    return { code: legacyCode, tampered: false };
  }

  if (lines.length !== 2) {
    return { code: null, tampered: true, tamperedReason: 'machine hint malformed' };
  }

  const code = lines[0] ?? '';
  const mac = lines[1] ?? '';
  if (!MACHINE_CODE_RE.test(code)) {
    return { code: null, tampered: true, tamperedReason: 'machine hint code malformed' };
  }
  if (!/^[a-fA-F0-9]{64}$/.test(mac)) {
    return { code: null, tampered: true, tamperedReason: 'machine hint MAC malformed' };
  }
  if (!safeHintEqual(mac.toLowerCase(), machineHintMac(code))) {
    return { code: null, tampered: true, tamperedReason: 'machine hint HMAC mismatch' };
  }
  return { code, tampered: false };
}

function machineHintMac(code: string): string {
  return createHmac('sha256', APP_PEPPER)
    .update(HINT_DOMAIN)
    .update('\0')
    .update(code)
    .digest('hex');
}

function safeHintEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

// ─── Signal collection ──────────────────────────────────────────────────

function collectSignals(): string[] {
  const out: string[] = [];
  out.push(`platform:${platform()}`);
  out.push(`arch:${arch()}`);
  out.push(`release-major:${(release().match(/^\d+/) ?? ['?'])[0]}`);
  out.push(`hostname:${hostname()}`);

  const cpuList = cpus();
  if (cpuList.length > 0) {
    out.push(`cpu:${cpuList[0]?.model.replace(/\s+/g, ' ').trim() ?? '?'}`);
    out.push(`cpu-count:${cpuList.length}`);
  }
  // Round to GiB so a kernel swap/VM resize doesn't change the bucket.
  out.push(`ram-gib:${Math.round(totalmem() / 1024 ** 3)}`);

  out.push(`mac:${stableMac()}`);
  out.push(`disk:${diskSerial()}`);
  return out;
}

/**
 * Pick the lexicographically-smallest non-internal, non-virtual MAC
 * address. Sorting + filtering gives stability across reboots regardless
 * of interface enumeration order.
 */
function stableMac(): string {
  try {
    const ifs = networkInterfaces();
    const macs: string[] = [];
    for (const list of Object.values(ifs)) {
      if (!list) continue;
      for (const ni of list) {
        if (ni.internal) continue;
        if (!ni.mac || ni.mac === '00:00:00:00:00:00') continue;
        // Skip docker / bridge / virtual interfaces best-effort by their MACs:
        // common hypervisor OUIs (00:50:56 VMware, 08:00:27 VBox, 52:54:00 KVM,
        // 00:0c:29 VMware, 02:42 Docker bridge). Not authoritative — just
        // a fast filter so the *first* hit prefers physical NICs.
        const lower = ni.mac.toLowerCase();
        if (
          lower.startsWith('02:42:') ||
          lower.startsWith('00:50:56') ||
          lower.startsWith('08:00:27') ||
          lower.startsWith('52:54:00') ||
          lower.startsWith('00:0c:29')
        ) {
          continue;
        }
        macs.push(lower);
      }
    }
    if (macs.length === 0) {
      // Fall back: include virtual MACs rather than '?' so the code is
      // still reproducible on this host.
      for (const list of Object.values(ifs)) {
        if (!list) continue;
        for (const ni of list)
          if (!ni.internal && ni.mac && ni.mac !== '00:00:00:00:00:00')
            macs.push(ni.mac.toLowerCase());
      }
    }
    macs.sort();
    return macs[0] ?? 'no-mac';
  } catch {
    return 'no-mac';
  }
}

/**
 * Per-platform best-effort disk/volume serial. Each branch wraps a single
 * shell command in execFileSync with strict argv (no shell interpolation)
 * and a short timeout. Failure returns 'no-disk' rather than throwing.
 */
function diskSerial(): string {
  try {
    if (platform() === 'linux') {
      const out = execFileSync('cat', ['/etc/machine-id'], {
        timeout: SAFE_TIMEOUT_MS,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .toLowerCase();
      if (/^[a-f0-9]{32}$/.test(out)) return out;
    } else if (platform() === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
        timeout: SAFE_TIMEOUT_MS,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const match = out.match(/IOPlatformUUID"\s*=\s*"([^"]+)"/);
      const uuid = match?.[1];
      if (uuid) return uuid.toLowerCase();
    } else if (platform() === 'win32') {
      const out = execFileSync('wmic', ['csproduct', 'get', 'UUID', '/value'], {
        timeout: SAFE_TIMEOUT_MS,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const match = out.match(/UUID=([A-Fa-f0-9-]{8,})/);
      const uuid = match?.[1];
      if (uuid) return uuid.toLowerCase();
    }
  } catch {
    // fall through
  }
  return 'no-disk';
}

// ─── Encoding ───────────────────────────────────────────────────────────

function encodeBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += CROCKFORD[(value << (5 - bits)) & 31];
  }
  // 80 bits = 16 chars exactly. Group as XXXX-XXXX-XXXX-XXXX.
  out = out.slice(0, 16);
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}
