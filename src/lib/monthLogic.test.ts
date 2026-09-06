import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backfillMonthDoc, canReopen, decideReopenStatus, effectiveMemberCosts, effectiveMemberWeights } from './monthLogic';
import { daysOfMonth, previousMonthIds } from './dates';
import { planMealWrites } from './ledger';

const rentCat = { id: 'room_rent', split_rule: 'per_member' as const, builtin: 'room_rent' as const };
const otherCat = { id: 'locker', split_rule: 'per_member' as const };
const members = [
  { uid: 'a', name: 'A', room_rent: 3000 },
  { uid: 'b', name: 'B', room_rent: 2500, status: 'left' as const },
];

test('effectiveMemberCosts uses profile rent by default and stored rent for backfill months', () => {
  const fromProfile = effectiveMemberCosts({ member_costs: { room_rent: { a: 999 } } }, members, [rentCat, otherCat]);
  assert.deepEqual(fromProfile.room_rent, { a: 3000, b: 2500 });
  const fromMonth = effectiveMemberCosts({ rent_source: 'month', member_costs: { room_rent: { a: 999 }, locker: { a: 100 } } }, members, [rentCat, otherCat]);
  assert.deepEqual(fromMonth.room_rent, { a: 999 });
  assert.deepEqual(fromMonth.locker, { a: 100 });
});

test('left members weigh 0 unless the month overrides', () => {
  assert.deepEqual(effectiveMemberWeights({}, members), { b: 0 });
  assert.deepEqual(effectiveMemberWeights({ member_weights: { b: 0.5 } }, members), { b: 0.5 });
});

test('reopen status and guard', () => {
  assert.equal(decideReopenStatus({ monthId: '2026-09', currentMonthId: '2026-09', hasActiveMonth: false }), 'active');
  assert.equal(decideReopenStatus({ monthId: '2026-09', currentMonthId: '2026-09', hasActiveMonth: true }), 'backfill');
  assert.equal(decideReopenStatus({ monthId: '2026-07', currentMonthId: '2026-09', hasActiveMonth: false }), 'backfill');
  assert.deepEqual(canReopen({ id: '2026-07', status: 'closed', advance_applied: true }, '2026-08'), { ok: false, reason: 'ADVANCE_LOCKED' });
  assert.deepEqual(canReopen({ id: '2026-08', status: 'closed', advance_applied: true }, '2026-08'), { ok: true });
  assert.deepEqual(canReopen({ id: '2026-07', status: 'closed', advance_applied: false }, '2026-08'), { ok: true });
  assert.deepEqual(canReopen({ id: '2026-07', status: 'backfill' }, '2026-08'), { ok: false, reason: 'NOT_CLOSED' });
});

test('backfillMonthDoc prefills rent and zero-weights left members', () => {
  const doc = backfillMonthDoc({ monthId: '2026-07', members, previous: { fixed_costs: { gas: 800 }, member_costs: { locker: { a: 50 } } } });
  assert.equal(doc.status, 'backfill');
  assert.equal(doc.rent_source, 'month');
  assert.deepEqual(doc.fixed_costs, { gas: 800 });
  assert.deepEqual(doc.member_costs.room_rent, { a: 3000, b: 2500 });
  assert.deepEqual(doc.member_costs.locker, { a: 50 });
  assert.deepEqual(doc.member_weights, { b: 0 });
});

test('daysOfMonth and previousMonthIds', () => {
  assert.equal(daysOfMonth('2024-02').length, 29);
  assert.equal(daysOfMonth('2026-09')[0], '2026-09-01');
  assert.equal(daysOfMonth('2026-09').at(-1), '2026-09-30');
  assert.deepEqual(previousMonthIds(3, new Date(2026, 0, 15)), ['2025-12', '2025-11', '2025-10']);
});

test('planMealWrites sets non-empty days and deletes emptied ones', () => {
  const types = [{ id: 'lunch', weight: 1 }, { id: 'breakfast', weight: 0.5 }];
  const writes = planMealWrites(
    [
      { uid: 'a', date: '2026-07-01', meals: { lunch: 1, breakfast: 1 } },
      { uid: 'a', date: '2026-07-02', meals: { lunch: 0 } },
      { uid: 'b', date: '2026-07-02', meals: {} },
    ],
    new Set(['a_2026-07-02']),
    types,
  );
  assert.deepEqual(writes, [
    { kind: 'set', id: 'a_2026-07-01', uid: 'a', date: '2026-07-01', meals: { lunch: 1, breakfast: 1 }, meal_count: 1.5 },
    { kind: 'delete', id: 'a_2026-07-02' },
  ]);
});
