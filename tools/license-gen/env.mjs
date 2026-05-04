import { createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const ROOT_ENV_PATH = path.join(REPO_ROOT, '.env');
export const KEYS_DIR = path.join(__dirname, 'keys');
export const LEGACY_PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
export const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');
export const EMBEDDED_PUBLIC_KEY_PATH = path.join(
  REPO_ROOT,
  'electron',
  'license',
  'public-key.cts',
);

export const PRIVATE_KEY_BASE64_ENV = 'APMS_LICENSE_PRIVATE_KEY_BASE64';
export const PRIVATE_KEY_PEM_ENV = 'APMS_LICENSE_PRIVATE_KEY_PEM';
export const PRIVATE_KEY_PATH_ENV = 'APMS_LICENSE_PRIVATE_KEY_PATH';

const PRIVATE_KEY_BASE64_ALIASES = [PRIVATE_KEY_BASE64_ENV, 'LICENSE_PRIVATE_KEY_BASE64'];
const PRIVATE_KEY_PEM_ALIASES = [
  PRIVATE_KEY_PEM_ENV,
  'LICENSE_PRIVATE_KEY_PEM',
  'LICENSE_PRIVATE_KEY',
];
const PRIVATE_KEY_PATH_ALIASES = [PRIVATE_KEY_PATH_ENV, 'LICENSE_PRIVATE_KEY_PATH'];

export function parseDotenv(source) {
  const out = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue = ''] = match;
    let value = rawValue.trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
    }
    out[key] = value;
  }
  return out;
}

export function loadLocalEnv(envPath = ROOT_ENV_PATH) {
  if (!envPath) return {};
  if (!existsSync(envPath)) return {};
  return parseDotenv(readFileSync(envPath, 'utf8'));
}

function lookupEnv(names, localEnv) {
  for (const name of names) {
    const value = process.env[name] ?? localEnv[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return { name, value: value.trim() };
    }
  }
  return null;
}

function normalizePem(pem) {
  return pem.trimEnd() + '\n';
}

function decodePrivateKey(value, sourceLabel) {
  let pem = value.trim();
  if (!pem.includes('-----BEGIN')) {
    try {
      pem = Buffer.from(pem, 'base64').toString('utf8');
    } catch (error) {
      throw new Error(`${sourceLabel} is not valid base64 or PEM text`, { cause: error });
    }
  }
  pem = normalizePem(pem.replace(/\\n/g, '\n'));

  try {
    createPrivateKey({ key: pem, format: 'pem' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${sourceLabel} is not a valid PEM private key: ${message}`, {
      cause: error,
    });
  }
  return pem;
}

export function readLicensePrivateKeyPem({ keyPath, allowLegacyFile = true, envPath } = {}) {
  const localEnv = loadLocalEnv(envPath);

  if (keyPath) {
    const resolved = path.resolve(keyPath);
    if (!existsSync(resolved)) throw new Error(`private key file not found at ${resolved}`);
    return {
      pem: decodePrivateKey(readFileSync(resolved, 'utf8'), `--key ${resolved}`),
      source: `--key ${resolved}`,
    };
  }

  const inlinePem = lookupEnv(PRIVATE_KEY_PEM_ALIASES, localEnv);
  if (inlinePem) {
    return {
      pem: decodePrivateKey(inlinePem.value, inlinePem.name),
      source: inlinePem.name,
    };
  }

  const base64Pem = lookupEnv(PRIVATE_KEY_BASE64_ALIASES, localEnv);
  if (base64Pem) {
    return {
      pem: decodePrivateKey(base64Pem.value, base64Pem.name),
      source: base64Pem.name,
    };
  }

  const configuredPath = lookupEnv(PRIVATE_KEY_PATH_ALIASES, localEnv);
  if (configuredPath) {
    const resolved = path.resolve(REPO_ROOT, configuredPath.value);
    if (!existsSync(resolved)) {
      throw new Error(`${configuredPath.name} points to a missing private key file: ${resolved}`);
    }
    return {
      pem: decodePrivateKey(readFileSync(resolved, 'utf8'), `${configuredPath.name}=${resolved}`),
      source: `${configuredPath.name}=${resolved}`,
    };
  }

  if (allowLegacyFile && existsSync(LEGACY_PRIVATE_KEY_PATH)) {
    return {
      pem: decodePrivateKey(readFileSync(LEGACY_PRIVATE_KEY_PATH, 'utf8'), LEGACY_PRIVATE_KEY_PATH),
      source: LEGACY_PRIVATE_KEY_PATH,
    };
  }

  throw new Error(
    `missing license private key. Set ${PRIVATE_KEY_BASE64_ENV} in .env or GitHub Actions secrets.`,
  );
}

export function derivePublicKeyPem(privateKeyPem) {
  const privateKey = createPrivateKey({ key: privateKeyPem, format: 'pem' });
  const publicKey = createPublicKey(privateKey);
  return normalizePem(publicKey.export({ type: 'spki', format: 'pem' }).toString());
}

export function replaceEmbeddedPublicKeySource(source, publicKeyPem) {
  const pattern = /export const LICENSE_PUBLIC_KEY_PEM = `[\s\S]*?` as const;/;
  if (!pattern.test(source)) {
    throw new Error('failed to patch electron/license/public-key.cts: marker not found');
  }
  return source.replace(
    pattern,
    `export const LICENSE_PUBLIC_KEY_PEM = \`${normalizePem(publicKeyPem)}\` as const;`,
  );
}

export function syncEmbeddedPublicKey(publicKeyPem, embeddedPath = EMBEDDED_PUBLIC_KEY_PATH) {
  const source = readFileSync(embeddedPath, 'utf8');
  const next = replaceEmbeddedPublicKeySource(source, publicKeyPem);
  if (next === source) return false;
  writeFileSync(embeddedPath, next, 'utf8');
  return true;
}
