import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, computeSettlement, type SettlementCategory, type SettlementInput } from './settlement';

const categories: SettlementCategory[] = [
  { id: 'buya', label_bn: 'বুয়া', label_en: 'Cook', split_rule: 'equal', timing: 'postpaid', active: true, sort_order: 10 },
  { id: 'net', label_bn: 'নেট', label_en: 'Internet', split_rule: 'equal', timing: 'postpaid', active: true, sort_order: 20 },
  { id: 'room_rent', label_bn: 'ভাড়া', label_en: 'Rent', split_rule: 'per_member', timing: 'prepaid', active: true, sort_order: 90, builtin: 'room_rent' },
  { id: 'old', label_bn: 'পুরনো', label_en: 'Old', split_rule: 'equal', timing: 'postpaid', active: false, sort_order: 99 },
];

function baseInput(overrides: Partial<SettlementInput> = {}): SettlementInput {
  return {
    monthId: '2026-09',
    members: [
      { uid: 'a', name: 'Alice', advance_balance: 0 },
      { uid: 'b', name: 'Bob', advance_balance: 0 },
      { uid: 'c', name: 'Carol', advance_balance: 0 },
    ],
    categories,
    mealTypes: [
      { id: 'lunch', weight: 1 },
      { id: 'dinner', weight: 1 },
      { id: 'breakfast', weight: 0.5 },
    ],
    fixedCosts: { buya: 3000, net: 1000 },
    memberCosts: { room_rent: { a: 3000, b: 2500, c: 2500 } },
    memberWeights: {},
    meals: [
      { user_id: 'a', meals: { lunch: 20, dinner: 20 } },
      { user_id: 'b', meals: { lunch: 10, dinner: 10 } },
      { user_id: 'c', meals: { lunch: 10, dinner: 10, breakfast: 40 } }, // 40 weighted
    ],
    expenses: [
      { user_id: 'a', amount_spent: 2000, expense_type: 'personal' },
      { user_id: 'b', amount_spent: 5000, expense_type: 'from_fund' },
    ],
    payments: [
      { user_id: 'a', amount: 1000, purpose: 'fund_deposit', status: 'confirmed' },
      { user_id: 'b', amount: 1000, purpose: 'fund_deposit', status: 'confirmed' },
      { user_id: 'c', amount: 1000, purpose: 'fund_deposit', status: 'pending' }, // not counted
      { user_id: 'c', amount: 2500, purpose: 'prepaid', status: 'confirmed' },
    ],
    applyAdvance: false,
    ...overrides,
  };
}

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

test('allocate: shares sum exactly to the total and are deterministic', () => {
  const shares = allocate(100000, new Map([['a', 1], ['b', 1], ['c', 1]]));
  assert.equal([...shares.values()].reduce((a, b) => a + b, 0), 100000);
  assert.deepEqual([...shares.values()].sort(), [33333, 33333, 33334]);

  const awkward = allocate(123456, new Map([['x', 1], ['y', 1], ['z', 1], ['w', 1], ['v', 1], ['u', 1], ['t', 1]]));
  assert.equal([...awkward.values()].reduce((a, b) => a + b, 0), 123456);

  const zero = allocate(5000, new Map([['a', 0], ['b', 0]]));
  assert.deepEqual([...zero.values()], [0, 0]);
});

test('happy path: meal rate, shares, credits, totals', () => {
  const result = computeSettlement(baseInput());
  // 7000 bazar / 100 weighted meals
  assert.equal(result.total_meals, 100);
  assert.equal(result.total_bazar, 7000);
  assert.equal(result.meal_rate, 70);
  assert.equal(result.total_fund_spending, 5000);
  assert.equal(result.total_deposits, 2000);
  assert.equal(result.fund_cash_on_hand, -3000);
  assert.deepEqual(result.warnings, []);

  const alice = result.rows.find((r) => r.uid === 'a')!;
  assert.equal(alice.meal_cost, 2800);
  assert.equal(alice.shares.buya, 1000);
  assert.equal(alice.shares.net, 333.34);
  assert.equal(alice.shares.room_rent, 3000);
  assert.equal(alice.prepaid_charges, 3000);
  assert.equal(alice.postpaid_charges, 2800 + 1000 + 333.34);
  assert.equal(alice.credits.personal_bazar, 2000);
  assert.equal(alice.credits.deposits, 1000);
  assert.equal(alice.gross_due, 7133.34 - 3000);
  assert.equal(alice.due_now, 3000);

  const carol = result.rows.find((r) => r.uid === 'c')!;
  assert.equal(carol.meal_count, 40);
  assert.equal(carol.credits.deposits, 0); // pending not counted
  assert.equal(carol.credits.prepaid_paid, 2500);
  assert.equal(carol.due_now, 0);

  // Invariant: charges == bazar + shared + per-member
  const expectedCharges = 7000 + 3000 + 1000 + (3000 + 2500 + 2500);
  assert.equal(sum(result.rows.map((r) => r.total_charges)), expectedCharges);
  assert.equal(result.grand.charges, expectedCharges);
  assert.equal(result.category_totals.buya, 3000);
  assert.equal(result.category_totals.net, 1000);
  assert.equal(result.category_totals.room_rent, 8000);
  assert.equal('old' in result.category_totals, false);
});

test('zero meals with bazar warns and leaves meal cost unallocated', () => {
  const result = computeSettlement(baseInput({ meals: [] }));
  assert.ok(result.warnings.includes('NO_MEALS'));
  assert.equal(result.meal_rate, 0);
  assert.equal(sum(result.rows.map((r) => r.meal_cost)), 0);
});

test('member with no entries still pays shared and per-member costs', () => {
  const result = computeSettlement(
    baseInput({ members: [...baseInput().members, { uid: 'd', name: 'Dan', advance_balance: 0 }], memberCosts: { room_rent: { a: 3000, b: 2500, c: 2500, d: 2000 } } }),
  );
  const dan = result.rows.find((r) => r.uid === 'd')!;
  assert.equal(dan.meal_count, 0);
  assert.equal(dan.meal_cost, 0);
  assert.equal(dan.shares.buya, 750);
  assert.equal(dan.shares.room_rent, 2000);
  assert.equal(dan.total_charges, 750 + 250 + 2000);
});

test('member weights: half month and excluded', () => {
  const result = computeSettlement(baseInput({ memberWeights: { b: 0.5, c: 0 } }));
  const alice = result.rows.find((r) => r.uid === 'a')!;
  const bob = result.rows.find((r) => r.uid === 'b')!;
  const carol = result.rows.find((r) => r.uid === 'c')!;
  assert.equal(alice.shares.buya, 2000);
  assert.equal(bob.shares.buya, 1000);
  assert.equal(carol.shares.buya, 0);
  assert.equal(carol.meal_cost, 2800); // still pays for meals eaten
  assert.equal(sum(result.rows.map((r) => r.shares.buya)), 3000);
});

test('by_meals split follows meal counts', () => {
  const cats: SettlementCategory[] = [{ id: 'gas', label_bn: 'গ্যাস', label_en: 'Gas', split_rule: 'by_meals', timing: 'postpaid', active: true, sort_order: 1 }];
  const result = computeSettlement(baseInput({ categories: cats, fixedCosts: { gas: 1000 }, memberCosts: {} }));
  assert.equal(result.rows.find((r) => r.uid === 'a')!.shares.gas, 400);
  assert.equal(result.rows.find((r) => r.uid === 'b')!.shares.gas, 200);
  assert.equal(result.rows.find((r) => r.uid === 'c')!.shares.gas, 400);
});

test('unknown member with orphan entries is included with weight 0 and a warning', () => {
  const result = computeSettlement(baseInput({ expenses: [...baseInput().expenses, { user_id: 'ghost', amount_spent: 100, expense_type: 'personal' }] }));
  const ghost = result.rows.find((r) => r.uid === 'ghost')!;
  assert.ok(ghost);
  assert.equal(ghost.weight, 0);
  assert.equal(ghost.shares.buya, 0);
  assert.equal(ghost.credits.personal_bazar, 100);
  assert.ok(result.warnings.includes('UNKNOWN_MEMBER:ghost'));
});

test('inactive category with leftover amount warns and is ignored', () => {
  const result = computeSettlement(baseInput({ fixedCosts: { buya: 3000, net: 1000, old: 500 } }));
  assert.ok(result.warnings.includes('INACTIVE_CATEGORY_HAS_AMOUNT:old'));
  assert.equal(result.rows[0].shares.old, undefined);
});

test('advance: larger than due, smaller than due, and overpayment carried forward', () => {
  const input = baseInput({
    members: [
      { uid: 'a', name: 'Alice', advance_balance: 10000 },
      { uid: 'b', name: 'Bob', advance_balance: 500 },
      { uid: 'c', name: 'Carol', advance_balance: 0 },
    ],
    payments: [...baseInput().payments, { user_id: 'c', amount: 20000, purpose: 'settlement', status: 'confirmed' }],
    applyAdvance: true,
  });
  const result = computeSettlement(input);
  const alice = result.rows.find((r) => r.uid === 'a')!;
  assert.equal(alice.advance_applied, alice.gross_due);
  assert.equal(alice.net_payable, 0);
  assert.equal(alice.advance_after, Math.round((10000 - alice.gross_due) * 100) / 100);

  const bob = result.rows.find((r) => r.uid === 'b')!;
  assert.equal(bob.advance_applied, 500);
  assert.equal(bob.net_payable, bob.gross_due - 500);
  assert.equal(bob.advance_after, 0);

  const carol = result.rows.find((r) => r.uid === 'c')!;
  assert.ok(carol.gross_due < 0);
  assert.equal(carol.net_payable, 0);
  assert.equal(carol.advance_after, -carol.gross_due);
});

test('legacy meal docs with meal_count only are summed', () => {
  const result = computeSettlement(baseInput({ meals: [{ user_id: 'a', meal_count: 2 }, { user_id: 'a', meal_count: 1.5 }] }));
  assert.equal(result.rows.find((r) => r.uid === 'a')!.meal_count, 3.5);
});
