import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { get, ref, runTransaction, set, update } from 'firebase/database';
import { seedFirstTransactionValue } from '../js/attempt-transaction.js';

const projectId = 'demo-exam-portal';
const adminUid = 'NdSGmG2MwbPob3us17UbXidZglW2';
const ruleDocument = JSON.parse(await readFile(new URL('../database/database-rules.json', import.meta.url), 'utf8'));
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    database: {
      host: '127.0.0.1',
      port: 9000,
      rules: JSON.stringify(ruleDocument),
    },
  });
  await environment.clearDatabase();
});

after(async () => {
  await environment?.cleanup();
});

function profile(uid, email, role = 'student') {
  return {
    uid,
    name: 'Test Student',
    email,
    role,
    examDomain: 'Python + Data Analytics',
    createdAt: Date.now(),
  };
}

function attempt(uid, email) {
  return {
    attemptId: uid,
    uid,
    studentName: 'Test Student',
    email,
    examId: 'python-data-analytics',
    examDomain: 'Python + Data Analytics',
    startedAt: Date.now(),
    currentPhase: 1,
    phaseStartedAt: Date.now(),
    phaseDurationSeconds: 600,
    mcqAnswers: Array(20).fill(-1),
    codingAnswers: Array(2).fill(''),
    oralAnswers: Array(5).fill(''),
    status: 'in_progress',
  };
}

test('students can create and read only their own profile and cannot promote themselves', async () => {
  const student = environment.authenticatedContext('student-1', {
    email: 'student1@example.com',
    email_verified: true,
  }).database();
  await assertSucceeds(runTransaction(
    ref(student, 'users/student-1'),
    (current) => current || profile('student-1', 'student1@example.com'),
    { applyLocally: false },
  ));
  await assertSucceeds(get(ref(student, 'users/student-1')));
  await assertFails(get(ref(student, 'users')));
  await assertFails(get(ref(student, 'users/student-2')));
  await assertFails(set(ref(student, 'users/student-1'), profile('student-1', 'student1@example.com', 'admin')));
});

test('only the pre-provisioned designated admin can read all student records', async () => {
  const student = environment.authenticatedContext('student-2', {
    email: 'student2@example.com',
    email_verified: true,
  }).database();
  await assertSucceeds(set(ref(student, 'users/student-2'), profile('student-2', 'student2@example.com')));
  await assertSucceeds(set(ref(student, 'attempts/student-2'), attempt('student-2', 'student2@example.com')));

  const admin = environment.authenticatedContext(adminUid, {
    email: 'lala@gmail.com',
    email_verified: false,
  }).database();
  const adminProfileRef = ref(admin, `users/${adminUid}`);
  await assertFails(set(adminProfileRef, profile(adminUid, 'lala@gmail.com', 'admin')));
  await assertFails(get(ref(admin, 'users')));
  await environment.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), `users/${adminUid}`), profile(adminUid, 'lala@gmail.com', 'admin'));
  });
  await assertSucceeds(update(adminProfileRef, { name: 'Updated Admin Name' }));
  const users = await assertSucceeds(get(ref(admin, 'users')));
  const attempts = await assertSucceeds(get(ref(admin, 'attempts')));
  assert.equal(users.child('student-2').exists(), true);
  assert.equal(attempts.child('student-2').exists(), true);
  assert.equal(attempts.child('student-2/mcqAnswers/0').val(), -1);

  const impostor = environment.authenticatedContext('different-admin-uid', {
    email: 'lala@gmail.com',
    email_verified: true,
  }).database();
  await assertFails(get(ref(impostor, 'users')));
  await assertFails(set(ref(impostor, 'users/different-admin-uid'), profile('different-admin-uid', 'lala@gmail.com', 'admin')));
});

test('attempt is unique per UID and becomes immutable after submission', async () => {
  const student = environment.authenticatedContext('student-3', {
    email: 'student3@example.com',
    email_verified: true,
  }).database();
  const attemptRef = ref(student, 'attempts/student-3');
  const initialAttempt = attempt('student-3', 'student3@example.com');
  await assertSucceeds(runTransaction(
    attemptRef,
    (current) => current || initialAttempt,
    { applyLocally: false },
  ));

  await assertFails(set(attemptRef, { ...initialAttempt, startedAt: initialAttempt.startedAt + 1 }));
  await assertFails(update(attemptRef, { currentPhase: 2, phaseStartedAt: Date.now() }));
  await assertSucceeds(update(attemptRef, {
    currentPhase: 2,
    phaseStartedAt: Date.now(),
    mcqAnswers: Array(20).fill(0),
  }));
  await assertFails(update(attemptRef, { currentPhase: 3, phaseStartedAt: Date.now() }));
  await assertSucceeds(update(attemptRef, {
    currentPhase: 3,
    phaseStartedAt: Date.now(),
    codingAnswers: ['code', 'code'],
  }));
  await assertSucceeds(update(attemptRef, {
    status: 'completed',
    completedAt: Date.now(),
    oralAnswers: Array(5).fill('answer'),
    result: 100,
    percentage: 100,
    breakdown: { mcq: 40, coding: 40, oral: 20 },
  }));
  await assertFails(update(attemptRef, { result: 0 }));
  await assertFails(set(attemptRef, null));
});

test('starting and saving the first MCQ answer uses the same confirmed attempt ID', async () => {
  const uid = 'student-first-answer';
  const email = 'first.answer@example.com';
  const student = environment.authenticatedContext(uid, {
    email,
    email_verified: true,
  }).database();
  const attemptRef = ref(student, `attempts/${uid}`);
  const beforeStart = await assertSucceeds(get(attemptRef));
  assert.equal(beforeStart.exists(), false);

  const attemptId = uid;
  const initialAttempt = attempt(uid, email);
  initialAttempt.attemptId = attemptId;
  const created = await assertSucceeds(runTransaction(
    attemptRef,
    (current) => current || initialAttempt,
    { applyLocally: false },
  ));
  assert.equal(created.committed, true);
  assert.equal(created.snapshot.child('attemptId').val(), attemptId);

  const confirmedAttempt = await assertSucceeds(get(attemptRef));
  assert.equal(confirmedAttempt.child('attemptId').val(), attemptId);
  const saved = await assertSucceeds(runTransaction(
    attemptRef,
    seedFirstTransactionValue(confirmedAttempt.val(), (current) => {
      if (!current || current.attemptId !== attemptId || current.status !== 'in_progress'
        || current.currentPhase !== 1) return;
      current.mcqAnswers[0] = 2;
      return current;
    }),
    { applyLocally: false },
  ));
  assert.equal(saved.committed, true);
  assert.equal(saved.snapshot.child('attemptId').val(), attemptId);
  assert.equal(saved.snapshot.child('mcqAnswers/0').val(), 2);

  const duplicateStart = await assertSucceeds(runTransaction(
    attemptRef,
    (current) => current || { ...initialAttempt, startedAt: Date.now() + 1000 },
    { applyLocally: false },
  ));
  assert.equal(duplicateStart.committed, true);
  assert.equal(duplicateStart.snapshot.child('startedAt').val(), initialAttempt.startedAt);
  assert.equal(duplicateStart.snapshot.child('attemptId').val(), attemptId);
});

test('Phase 1 answers are committed before the attempt advances to Phase 2', async () => {
  const uid = 'student-phase-transition';
  const email = 'phase.transition@example.com';
  const student = environment.authenticatedContext(uid, {
    email,
    email_verified: true,
  }).database();
  const attemptRef = ref(student, `attempts/${uid}`);
  const initialAttempt = attempt(uid, email);
  const created = await assertSucceeds(runTransaction(
    attemptRef,
    (current) => current || initialAttempt,
    { applyLocally: false },
  ));
  assert.equal(created.committed, true);

  const beforeSaving = await assertSucceeds(get(attemptRef));
  const answers = Array(20).fill(2);
  const saved = await assertSucceeds(runTransaction(
    attemptRef,
    seedFirstTransactionValue(beforeSaving.val(), (current) => {
      if (!current || current.status !== 'in_progress' || current.currentPhase !== 1) return;
      current.attemptId = uid;
      current.mcqAnswers = answers;
      return current;
    }),
    { applyLocally: false },
  ));
  assert.equal(saved.committed, true);
  assert.deepEqual(saved.snapshot.child('mcqAnswers').val(), answers);

  const advanced = await assertSucceeds(runTransaction(
    attemptRef,
    seedFirstTransactionValue(saved.snapshot.val(), (current) => {
      if (!current || current.status !== 'in_progress' || current.currentPhase !== 1
        || !current.mcqAnswers.every((answer) => Number.isInteger(answer) && answer >= 0 && answer < 4)) return;
      current.currentPhase = 2;
      current.phaseStartedAt = Date.now();
      current.phaseDurationSeconds = 600;
      return current;
    }),
    { applyLocally: false },
  ));
  assert.equal(advanced.committed, true);
  assert.equal(advanced.snapshot.child('currentPhase').val(), 2);
  assert.deepEqual(advanced.snapshot.child('mcqAnswers').val(), answers);
});

test('a valid legacy attempt without an ID can be resumed and assigned its stable ID', async () => {
  const uid = 'student-legacy-attempt';
  const email = 'legacy.attempt@example.com';
  const student = environment.authenticatedContext(uid, {
    email,
    email_verified: true,
  }).database();
  const attemptRef = ref(student, `attempts/${uid}`);
  const legacyAttempt = attempt(uid, email);
  delete legacyAttempt.attemptId;
  await environment.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), `attempts/${uid}`), legacyAttempt);
  });

  const existing = await assertSucceeds(get(attemptRef));
  assert.equal(existing.child('status').val(), 'in_progress');
  assert.equal(existing.child('attemptId').exists(), false);
  const resumed = await assertSucceeds(runTransaction(
    attemptRef,
    seedFirstTransactionValue(existing.val(), (current) => {
      if (!current || current.status !== 'in_progress') return;
      current.attemptId = uid;
      current.mcqAnswers[0] = 1;
      return current;
    }),
    { applyLocally: false },
  ));
  assert.equal(resumed.committed, true);
  assert.equal(resumed.snapshot.child('attemptId').val(), uid);
  assert.equal(resumed.snapshot.child('mcqAnswers/0').val(), 1);
});

test('time-expired submissions can save partial phase results', async () => {
  const student = environment.authenticatedContext('student-expired', {
    email: 'expired@example.com',
    email_verified: true,
  }).database();
  const attemptRef = ref(student, 'attempts/student-expired');
  await assertSucceeds(set(attemptRef, attempt('student-expired', 'expired@example.com')));
  await assertSucceeds(update(attemptRef, {
    status: 'completed',
    terminationReason: 'time-expired',
    completedAt: Date.now(),
    result: 0,
    percentage: 0,
    breakdown: { mcq: 0, coding: 0, oral: 0 },
  }));
});
