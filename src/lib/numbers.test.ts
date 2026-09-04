import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTk, normalizeDigits, parseAmount, toBengaliDigits } from './numbers';

test('normalizeDigits converts Bengali and Arabic-Indic digits', () => {
  assert.equal(normalizeDigits('৫০০.৫'), '500.5');
  assert.equal(normalizeDigits('١٢٣'), '123');
  assert.equal(normalizeDigits('1,234 '), '1234');
});

test('parseAmount rejects garbage and negatives', () => {
  assert.equal(parseAmount('৫০০'), 500);
  assert.equal(parseAmount('12.345'), 12.35);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('-5'), null);
});

test('formatTk and toBengaliDigits', () => {
  assert.equal(formatTk(1234.5), '1,234.50 ৳');
  assert.equal(formatTk(1234.5, 'bn'), '১,২৩৪.৫০ ৳');
  assert.equal(toBengaliDigits('2026'), '২০২৬');
});
