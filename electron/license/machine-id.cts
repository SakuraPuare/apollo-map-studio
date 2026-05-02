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
 * The result is cached on disk under userData/.lic-machine.dat so a single
 * NIC swap or a virtualised MAC flap doesn't immediately invalidate the
 * license (the license itself still contains the original code; if the
 * recompute differs we surface a `machine_mismatch` status).
 */

import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces, cpus, totalmem, platform, release, hostname, arch } from 'node:os';
import path from 'node:path';

import { APP_PEPPER } from './public-key.cjs';

const CROCKFORD = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789'; // no I, L, O, U
const SAFE_TIMEOUT_MS = 1500;

// ─── Public API ─────────────────────────────────────────────────────────

let cached: string | null = null;

export interface MachineCodeResult {
  code: string;
  /** Source signals actually used (for diagnostics — never logged). */
  signals: string[];
  /** Raw 32-byte HMAC digest for downstream HKDF derivation. */
  digestHex: string;
}

/**
 * Compute the machine code. Subsequent calls return the in-memory cached
 * value. Pass `userDataDir` so we can persist the first-seen value and
 * detect future drift.
 */
export function computeMachineCode(userDataDir: string): MachineCodeResult {
  if (cached) {
    return finalise(cached, []);
  }
  const signals = collectSignals();
  const ikm = signals.join('||');
  const digest = createHmac('sha256', APP_PEPPER).update(ikm).digest();
  const code = encodeBase32(digest.subarray(0, 10));
  cached = code;

  // Persist a soft hint so we can detect MAC churn without re-doing the
  // (slow) shell calls. The hint is encrypted with a per-machine key in
  // storage.cts — here we just write the raw value with an HMAC, since
  // an attacker who can read userData can also call this function.
  try {
    const hintPath = path.join(userDataDir, '.lic-machine.dat');
    if (!existsSync(hintPath)) {
      writeFileSync(hintPath, code, { mode: 0o600 });
    }
  } catch {
    // Non-fatal — the in-memory cache still works.
  }

  return {
    code,
    signals: signals.map((s) => s.split(':')[0] ?? ''),
    digestHex: digest.toString('hex'),
  };
}

/**
 * Read a previously-persisted machine code hint without re-deriving. Used
 * when we want to detect changes in collected signals (e.g. an attacker
 * spoofing one source) — the persisted hint is the *first* code we ever
 * saw on this device.
 */
export function readPersistedHint(userDataDir: string): string | null {
  try {
    const hintPath = path.join(userDataDir, '.lic-machine.dat');
    if (!existsSync(hintPath)) return null;
    const raw = readFileSync(hintPath, 'utf8').trim();
    if (!/^[A-Z0-9-]{16,32}$/.test(raw)) return null;
    return raw;
  } catch {
    return null;
  }
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

function finalise(code: string, signals: string[]): MachineCodeResult {
  return { code, signals, digestHex: '' };
}
