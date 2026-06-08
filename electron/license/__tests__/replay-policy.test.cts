import assert from 'node:assert/strict';
import test from 'node:test';

import { isLicenseExpiryDowngrade } from '../replay-policy.cjs';

test('isLicenseExpiryDowngrade treats perpetual licenses as the highest expiry', () => {
  const finiteLonger = Date.parse('2027-01-01T00:00:00.000Z');
  const finiteShorter = Date.parse('2026-01-01T00:00:00.000Z');

  assert.equal(isLicenseExpiryDowngrade(0, finiteLonger), true);
  assert.equal(isLicenseExpiryDowngrade(0, 0), false);
  assert.equal(isLicenseExpiryDowngrade(finiteShorter, 0), false);
  assert.equal(isLicenseExpiryDowngrade(finiteLonger, finiteShorter), true);
  assert.equal(isLicenseExpiryDowngrade(finiteShorter, finiteLonger), false);
  assert.equal(isLicenseExpiryDowngrade(finiteShorter, finiteShorter), false);
});
