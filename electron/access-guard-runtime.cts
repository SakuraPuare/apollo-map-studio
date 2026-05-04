import os from 'node:os';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const ACCESS_GUARD_BLOCKLIST = ['daohu527', 'wheelos-tools', 'wheelos'];

export interface AccessGuardIdentity {
  osUsername: string;
  gitName: string;
  gitEmail: string;
  hostname: string;
  homedir: string;
  platform: string;
  arch: string;
  release: string;
  machineId: string;
  envUser: string;
}

export interface AccessGuardMatch {
  matched: boolean;
  keyword: string | null;
  identity: string | null;
  field: keyof AccessGuardIdentity | null;
}

const EMPTY_IDENTITY: AccessGuardIdentity = {
  osUsername: '',
  gitName: '',
  gitEmail: '',
  hostname: '',
  homedir: '',
  platform: '',
  arch: '',
  release: '',
  machineId: '',
  envUser: '',
};

const IDENTITY_FIELDS = [
  'osUsername',
  'gitName',
  'gitEmail',
  'hostname',
  'homedir',
  'platform',
  'arch',
  'release',
  'machineId',
  'envUser',
] as const satisfies readonly (keyof AccessGuardIdentity)[];

let cachedIdentity: AccessGuardIdentity | null = null;

export function getAccessGuardIdentity(): AccessGuardIdentity {
  cachedIdentity ??= detectIdentity();
  return cachedIdentity;
}

export function checkAccessGuardAccess() {
  const identity = getAccessGuardIdentity();
  const match = matchBlocklist(identity, ACCESS_GUARD_BLOCKLIST);

  return {
    allowed: !match.matched,
    identity,
    match,
    denialHtml: match.matched ? generateDenialHtml(match.keyword ?? '') : null,
  };
}

function detectIdentity(): AccessGuardIdentity {
  const identity = { ...EMPTY_IDENTITY };

  try {
    const userInfo = os.userInfo();
    identity.osUsername = userInfo.username || '';
    identity.homedir = userInfo.homedir || '';
  } catch {
    // os.userInfo may throw in restricted runtimes; keep empty identity defaults.
  }

  identity.gitName = readGitConfig('user.name');
  identity.gitEmail = readGitConfig('user.email');
  identity.hostname = os.hostname?.() || '';
  identity.platform = process.platform;
  identity.arch = process.arch;
  identity.release = os.release?.() || '';
  identity.envUser = firstEnv('USER', 'USERNAME', 'LOGNAME');

  const machineSeed = readMachineSeed();
  identity.machineId = machineSeed ? `sha256:${hash(machineSeed)}` : '';

  return identity;
}

function readGitConfig(key: string): string {
  return readCommand(`git config ${key}`);
}

function readCommand(command: string): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim();
  } catch {
    return '';
  }
}

function firstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }

  return '';
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readMachineSeed(): string {
  switch (process.platform) {
    case 'darwin': {
      const output = readCommand('ioreg -rd1 -c IOPlatformExpertDevice');
      return output.match(/"IOPlatformUUID" = "([^"]+)"/)?.[1] ?? '';
    }
    case 'win32':
      return (
        readCommand('wmic csproduct get UUID')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .find((line) => !/^uuid$/i.test(line)) ?? ''
      );
    case 'linux':
      return readCommand('cat /etc/machine-id') || readCommand('cat /var/lib/dbus/machine-id');
    default:
      return '';
  }
}

function matchBlocklist(identity: AccessGuardIdentity, blocklist: string[]): AccessGuardMatch {
  for (const keyword of blocklist) {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) continue;

    for (const field of IDENTITY_FIELDS) {
      const value = identity[field];
      if (value && value.toLowerCase().includes(normalizedKeyword)) {
        return { matched: true, keyword, identity: value, field };
      }
    }
  }

  return { matched: false, keyword: null, identity: null, field: null };
}

function generateDenialHtml(keyword: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Access Denied</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#1e1e1e;color:#ccc;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,system-ui,sans-serif}
</style>
</head>
<body>
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f14c4c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
  </svg>
  <h1 style="font-size:24px;font-weight:600;color:#f14c4c;margin-top:24px;margin-bottom:8px">Access Denied</h1>
  <p style="font-size:14px;color:#858585;max-width:400px;text-align:center;line-height:1.5">You are not authorized to use this application.</p>
  <div style="margin-top:24px;padding:12px 20px;background:#252526;border:1px solid #3c3c3c;border-radius:6px;font-size:12px;color:#858585;font-family:'SF Mono','Fira Code','Cascadia Code',Consolas,monospace">
    Matched policy keyword: <span style="color:#f14c4c">${escapeHtml(keyword)}</span>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
