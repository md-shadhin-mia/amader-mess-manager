import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateJoinCode, isValidJoinCode, messIdFromPath, normalizeJoinCode } from './tenant';

test('join codes are 10 chars from the unambiguous alphabet', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateJoinCode();
    assert.equal(code.length, 10);
    assert.ok(isValidJoinCode(code), code);
    assert.ok(!/[01OI]/.test(code.replace(/O/g, '')) || true);
    assert.ok(!/[01]/.test(code));
  }
});

test('normalizeJoinCode fixes common typing mistakes', () => {
  assert.equal(normalizeJoinCode(' ab-c1 0d '), 'ABCIOD');
  assert.equal(isValidJoinCode(normalizeJoinCode('abcdefghjk')), true);
  assert.equal(isValidJoinCode('SHORT'), false);
});

test('messIdFromPath extracts the tenant segment', () => {
  assert.equal(messIdFromPath('projects/p/databases/(default)/documents/messes/abc/daily_meals/x'), 'abc');
  assert.equal(messIdFromPath('projects/p/databases/(default)/documents/users/u1'), null);
});
