import test from 'node:test';
import assert from 'node:assert';

function formatProgressPercentage(progress) {
  const value = Math.min(100, Math.max(0, Math.round(Number(progress || 0))));
  return `${value}%`;
}

function getProgressWidthStyle(progress) {
  const value = Math.min(100, Math.max(0, Math.round(Number(progress || 0))));
  return `${value}%`;
}

test('Progress Percentage Indicator Contract', async (t) => {
  await t.test('1. Correctly formats integer progress percentage', () => {
    assert.strictEqual(formatProgressPercentage(25), '25%');
    assert.strictEqual(getProgressWidthStyle(25), '25%');
  });

  await t.test('2. Correctly formats 0% progress', () => {
    assert.strictEqual(formatProgressPercentage(0), '0%');
    assert.strictEqual(getProgressWidthStyle(0), '0%');
  });

  await t.test('3. Safely handles null or undefined progress', () => {
    assert.strictEqual(formatProgressPercentage(undefined), '0%');
    assert.strictEqual(formatProgressPercentage(null), '0%');
    assert.strictEqual(getProgressWidthStyle(undefined), '0%');
  });

  await t.test('4. Correctly rounds floating point progress values', () => {
    assert.strictEqual(formatProgressPercentage(33.7), '34%');
    assert.strictEqual(formatProgressPercentage(33.2), '33%');
  });

  await t.test('5. Safely clamps progress between 0% and 100%', () => {
    assert.strictEqual(formatProgressPercentage(150), '100%');
    assert.strictEqual(formatProgressPercentage(-20), '0%');
  });
});
