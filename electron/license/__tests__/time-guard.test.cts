import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import path from 'node:path';
import test, { afterEach, beforeEach } from 'node:test';

import { TimeGuard } from '../time-guard.cjs';

const MACHINE = 'A6N0-SMBW-ENSG-SDGT';
const START = Date.parse('2026-05-05T00:00:00.000Z');
const MINUTE = 60 * 1000;

let dir = '';
let wallNow = START;
let restoreClock: (() => void) | null = null;

function installClock(now: number): void {
  wallNow = now;
  const realDateNow = Date.now;
  Object.defineProperty(Date, 'now', {
    value: () => wallNow,
    configurable: true,
    writable: true,
  });
  restoreClock = () => {
    Object.defineProperty(Date, 'now', {
      value: realDateNow,
      configurable: true,
      writable: true,
    });
  };
}

function makeGuard(): TimeGuard {
  return new TimeGuard(dir, MACHINE, []);
}

function tick(guard: TimeGuard): void {
  (guard as unknown as { tick(): void }).tick();
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'apms-time-guard-'));
  installClock(START);
});

afterEach(() => {
  if (restoreClock) restoreClock();
  restoreClock = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('TimeGuard tolerates forward wallclock jumps that look like sleep resume', () => {
  const guard = makeGuard();

  wallNow += 2 * 60 * MINUTE;
  tick(guard);

  const snapshot = guard.snapshot();
  assert.equal(snapshot.tampered, false);
  assert.equal(snapshot.lastSeen, wallNow);
  assert.equal(guard.trustedNow(), wallNow);
});

test('TimeGuard honors the grace window for small backward clock corrections', () => {
  const guard = makeGuard();

  wallNow += 10 * MINUTE;
  tick(guard);
  const highWater = wallNow;

  wallNow -= MINUTE;
  tick(guard);

  const snapshot = guard.snapshot();
  assert.equal(snapshot.tampered, false);
  assert.equal(snapshot.lastSeen, highWater);
  assert.equal(guard.trustedNow(), highWater);
});

test('TimeGuard marks rollback beyond the grace window as tampered', () => {
  const guard = makeGuard();

  wallNow += 10 * MINUTE;
  tick(guard);
  wallNow -= 6 * MINUTE;
  tick(guard);

  const snapshot = guard.snapshot();
  assert.equal(snapshot.tampered, true);
  assert.match(snapshot.tamperedReason ?? '', /wallclock rollback/);
});
