import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAttempt, isPhaseComplete } from '../js/evaluation.js';

test('scores all three phases to 100 marks', () => {
  const result = evaluateAttempt({
    mcqAnswers: [0, 1, 1, 0, 0, 2, 0, 1, 1, 0, 1, 1, 0, 0, 0, 3, 0, 1, 0, 0],
    codingAnswers: [
      'adults >= 18 sum(ages) len(adults) return',
      'float(value) continue try except return cleaned',
    ],
    oralAnswers: Array.from({ length: 5 }, () => (
      Array.from({ length: 35 }, (_, index) => ['Python', 'data', 'analysis'][index % 3]).join(' ')
    )),
  });

  assert.deepEqual(result, {
    totalMarks: 100,
    percentage: 100,
    breakdown: { mcq: 40, coding: 40, oral: 20 },
  });
});

test('empty answer arrays earn zero marks', () => {
  assert.deepEqual(evaluateAttempt({}), {
    totalMarks: 0,
    percentage: 0,
    breakdown: { mcq: 0, coding: 0, oral: 0 },
  });
});

test('phase completion validates required answers', () => {
  assert.equal(isPhaseComplete(1, Array(20).fill(0)), true);
  assert.equal(isPhaseComplete(1, Array(20).fill(-1)), false);
  assert.equal(isPhaseComplete(2, ['code', '']), false);
  assert.equal(isPhaseComplete(3, Array(5).fill('answer')), true);
});
