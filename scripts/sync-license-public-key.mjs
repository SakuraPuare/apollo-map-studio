#!/usr/bin/env node
/**
 * Sync the embedded Electron license public key from the private key supplied
 * by .env or CI secrets. The private key never needs to be written to disk.
 */

import {
  EMBEDDED_PUBLIC_KEY_PATH,
  derivePublicKeyPem,
  replaceEmbeddedPublicKeySource,
  readLicensePrivateKeyPem,
  syncEmbeddedPublicKey,
} from '../tools/license-gen/env.mjs';
import { readFileSync } from 'node:fs';

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const ci = args.includes('--ci') || process.env.CI === 'true';
  const quiet = args.includes('--quiet');

  let key;
  try {
    key = readLicensePrivateKeyPem({ allowLegacyFile: false, envPath: ci ? false : undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\nRefusing to build a desktop binary without the signing private key.`,
      { cause: error },
    );
  }

  const publicKeyPem = derivePublicKeyPem(key.pem);
  const source = readFileSync(EMBEDDED_PUBLIC_KEY_PATH, 'utf8');
  const changed = replaceEmbeddedPublicKeySource(source, publicKeyPem) !== source;
  if (check && changed) {
    throw new Error(`${EMBEDDED_PUBLIC_KEY_PATH} is not in sync with the configured private key`);
  }
  if (!check && changed) syncEmbeddedPublicKey(publicKeyPem);

  if (!quiet) {
    console.log(
      changed
        ? `[license] synced embedded public key from ${key.source}`
        : `[license] embedded public key already matches ${key.source}`,
    );
  }
}

main();
