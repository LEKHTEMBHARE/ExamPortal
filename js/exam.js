import { auth, db, ref, get, runTransaction, onAuthStateChanged, watchConnectionStatus } from './firebase.js';
import { ensureUserProfile } from './auth.js';
import { mcqQuestions, codingQuestions, oralQuestions, examConfig } from './questions.js';
import { watchExamTabSwitch } from './security.js';
import { evaluateAttempt, isPhaseComplete } from './evaluation.js';
import { seedFirstTransactionValue } from './attempt-transaction.js';

const instructionsView = document.getElementById('instructionsView');
const examView = document.getElementById('examView');
const timerDisplay = document.getElementById('timerDisplay');
const phaseBadge = document.getElementById('phaseBadge');
const startExamButton = document.getElementById('startExamButton');
const questionNav = document.getElementById('questionNav');
const questionHeader = document.getElementById('questionHeader');
const questionContent = document.getElementById('questionContent');
const answerContainer = document.getElementById('answerContainer');
const phaseLabel = document.getElementById('phaseLabel');
const statusBadge = document.getElementById('statusBadge');
const previousButton = document.getElementById('previousButton');
const nextButton = document.getElementById('nextButton');
const continueButton = document.getElementById('continueButton');
const toastNode = document.getElementById('toast');
const submitDialog = document.getElementById('submitDialog');
const confirmSubmitButton = document.getElementById('confirmSubmitButton');
const saveStatusNode = document.getElementById('saveStatus');
watchConnectionStatus(document.getElementById('networkStatus'));

const state = {
  user: null,
  attemptId: null,
  activeAttempt: null,
  phase: 1,
  questionIndex: 0,
  mcqAnswers: Array(mcqQuestions.length).fill(-1),
  codingAnswers: Array(codingQuestions.length).fill(''),
  oralAnswers: Array(oralQuestions.length).fill(''),
  phaseStartedAt: 0,
  phaseDurationSeconds: examConfig.phaseDurationSeconds.phase1,
  timerId: null,
  saveTimeoutId: null,
  saveInFlight: null,
  tabListenerCleanup: null,
  examStarted: false,
  isSubmitted: false,
  isSubmitting: false,
  isAdvancing: false,
  isSaving: false,
  pendingSubmissionReason: null,
};

const phaseQuestions = () => state.phase === 1 ? mcqQuestions : state.phase === 2 ? codingQuestions : oralQuestions;
const phaseAnswers = () => state.phase === 1 ? state.mcqAnswers : state.phase === 2 ? state.codingAnswers : state.oralAnswers;

function showToast(message) {
  toastNode.textContent = message;
  toastNode.classList.add('show');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => toastNode.classList.remove('show'), 3200);
}

function setSaveStatus(text, error = false) {
  saveStatusNode.textContent = text;
  saveStatusNode.classList.toggle('has-error', error);
}

function isPermissionDenied(error) {
  return error?.code === 'PERMISSION_DENIED'
    || error?.code === 'database/permission-denied'
    || /permission[_ ]denied/i.test(error?.message || '');
}

function getAttemptReference(attemptId) {
  return ref(db, `attempts/${attemptId}`);
}

function permissionMessage(action) {
  return `Realtime Database denied ${action}. Verify the signed-in student's access and deploy the current database rules.`;
}

function getPhaseDuration(phase) {
  return examConfig.phaseDurationSeconds[`phase${phase}`];
}

function applyAttempt(attempt) {
  state.attemptId = attempt.attemptId || state.user.uid;
  state.activeAttempt = attempt;
  state.phase = Number(attempt.currentPhase || 1);
  state.phaseStartedAt = Number(attempt.phaseStartedAt || Date.now());
  state.phaseDurationSeconds = Number(attempt.phaseDurationSeconds || getPhaseDuration(state.phase));
  state.mcqAnswers = Array.from({ length: mcqQuestions.length }, (_, index) => (
    Number.isInteger(attempt.mcqAnswers?.[index]) && attempt.mcqAnswers[index] >= 0
      ? attempt.mcqAnswers[index]
      : null
  ));
  state.codingAnswers = Array.from({ length: codingQuestions.length }, (_, index) => attempt.codingAnswers?.[index] ?? '');
  state.oralAnswers = Array.from({ length: oralQuestions.length }, (_, index) => attempt.oralAnswers?.[index] ?? '');
}

function updateTimer() {
  const remaining = Math.max(0, Math.ceil((state.phaseStartedAt + state.phaseDurationSeconds * 1000 - Date.now()) / 1000));
  timerDisplay.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  if (remaining === 0 && state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
    submitAttempt('time-expired');
  }
}

function startTimer() {
  if (state.timerId) clearInterval(state.timerId);
  updateTimer();
  state.timerId = window.setInterval(updateTimer, 500);
}

function hasAnswer(phase, index) {
  const answer = (phase === 1 ? state.mcqAnswers : phase === 2 ? state.codingAnswers : state.oralAnswers)[index];
  return phase === 1 ? Number.isInteger(answer) : typeof answer === 'string' && answer.trim().length > 0;
}

function renderPalette() {
  questionNav.replaceChildren();
  phaseQuestions().forEach((_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-button';
    button.textContent = String(index + 1);
    button.setAttribute('aria-label', `Question ${index + 1}${hasAnswer(state.phase, index) ? ', answered' : ', unanswered'}`);
    if (index === state.questionIndex) button.classList.add('active');
    if (hasAnswer(state.phase, index)) button.classList.add('answered');
    button.addEventListener('click', () => {
      const allPreviousAnswered = phaseQuestions().slice(0, index).every((_, previousIndex) => hasAnswer(state.phase, previousIndex));
      if (!allPreviousAnswered) {
        showToast('Answer the earlier questions before moving ahead.');
        return;
      }
      state.questionIndex = index;
      renderQuestion();
    });
    questionNav.append(button);
  });
}

function renderQuestion() {
  const question = phaseQuestions()[state.questionIndex];
  if (!question) return;
  phaseBadge.textContent = `Phase ${state.phase} of 3`;
  phaseLabel.textContent = state.phase === 1 ? 'Phase 1 · Multiple choice' : state.phase === 2 ? 'Phase 2 · Coding' : 'Phase 3 · Oral';
  questionHeader.textContent = `${state.phase === 1 ? 'Question' : state.phase === 2 ? 'Coding question' : 'Oral question'} ${state.questionIndex + 1}`;
  questionContent.replaceChildren();

  if (state.phase === 1) {
    const prompt = document.createElement('p');
    prompt.textContent = question.question;
    questionContent.append(prompt);
    answerContainer.replaceChildren();
    question.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `option-item${state.mcqAnswers[state.questionIndex] === index ? ' selected' : ''}`;
      const letter = document.createElement('span');
      letter.className = 'option-letter';
      letter.textContent = String.fromCharCode(65 + index);
      const text = document.createElement('span');
      text.className = 'option-text';
      text.textContent = option;
      button.append(letter, text);
      button.addEventListener('click', () => {
        state.mcqAnswers[state.questionIndex] = index;
        renderQuestion();
        scheduleSave();
      });
      answerContainer.append(button);
    });
  } else if (state.phase === 2) {
    const title = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = question.title;
    title.append(strong);
    const requirement = document.createElement('p');
    requirement.textContent = question.requirement;
    const starter = document.createElement('pre');
    starter.textContent = question.starterCode;
    questionContent.append(title, requirement, starter);
    const editor = document.createElement('textarea');
    editor.className = 'code-editor';
    editor.setAttribute('aria-label', 'Coding answer');
    editor.value = state.codingAnswers[state.questionIndex];
    editor.addEventListener('input', () => {
      state.codingAnswers[state.questionIndex] = editor.value;
      updateCompletion();
      scheduleSave();
    });
    answerContainer.replaceChildren(editor);
  } else {
    const prompt = document.createElement('p');
    prompt.textContent = question;
    questionContent.append(prompt);
    const editor = document.createElement('textarea');
    editor.className = 'oral-answer';
    editor.setAttribute('aria-label', 'Oral answer');
    editor.placeholder = 'Write your response here...';
    editor.value = state.oralAnswers[state.questionIndex];
    editor.addEventListener('input', () => {
      state.oralAnswers[state.questionIndex] = editor.value;
      updateCompletion();
      scheduleSave();
    });
    answerContainer.replaceChildren(editor);
  }

  updateCompletion();
}

function updateCompletion() {
  const answers = phaseAnswers();
  const complete = isPhaseComplete(state.phase, answers);
  statusBadge.textContent = hasAnswer(state.phase, state.questionIndex) ? 'Answered' : 'In progress';
  continueButton.disabled = !complete || state.isSaving || state.isAdvancing;
  continueButton.textContent = state.isAdvancing
    ? 'Saving and continuing…'
    : state.phase === 3 ? 'Submit examination' : `Continue to Phase ${state.phase + 1}`;
  previousButton.disabled = state.questionIndex === 0;
  nextButton.disabled = state.questionIndex >= phaseQuestions().length - 1;
  renderPalette();
}

async function saveAnswers() {
  if (!state.examStarted || state.isSubmitted) return;
  if (state.saveInFlight) await state.saveInFlight;
  state.isSaving = true;
  updateCompletion();
  setSaveStatus('Saving answers…');
  const phase = state.phase;
  const answers = [...phaseAnswers()].map((answer) => (
    phase === 1 && !Number.isInteger(answer) ? -1 : answer
  ));
  const answerKey = phase === 1 ? 'mcqAnswers' : phase === 2 ? 'codingAnswers' : 'oralAnswers';
  const attemptRef = getAttemptReference(state.attemptId);
  const operation = (async () => {
    const confirmedAttempt = state.activeAttempt;
    if (!confirmedAttempt) {
      throw new Error('No examination attempt exists at the authenticated student record. Return to your dashboard and start or resume the saved attempt.');
    }
    if (confirmedAttempt.attemptId && confirmedAttempt.attemptId !== state.attemptId) {
      throw new Error('The saved examination attempt ID does not match this session. Return to your dashboard and resume the attempt.');
    }

    let abortReason = '';
    const transaction = await runTransaction(attemptRef, seedFirstTransactionValue(confirmedAttempt, (attempt) => {
      if (!attempt) {
        abortReason = 'The saved examination attempt disappeared before the answer could be saved.';
        return;
      }
      if (attempt.attemptId && attempt.attemptId !== state.attemptId) {
        abortReason = 'The saved examination attempt ID does not match this session.';
        return;
      }
      if (attempt.status !== 'in_progress') {
        abortReason = `This examination attempt is ${attempt.status || 'unavailable'} and can no longer be changed.`;
        return;
      }
      if (attempt.currentPhase !== phase) {
        abortReason = `The saved attempt is on Phase ${attempt.currentPhase}, not Phase ${phase}. Refresh the page to resume the current phase.`;
        return;
      }
      attempt.attemptId = state.attemptId;
      attempt.examDomain = attempt.examDomain || 'Python + Data Analytics';
      attempt.studentName = attempt.studentName || state.user.displayName || 'Student';
      attempt[answerKey] = answers;
      return attempt;
    }), { applyLocally: false });
    if (!transaction.committed) {
      const currentAttempt = transaction.snapshot.val();
      if (!currentAttempt && !abortReason) {
        abortReason = 'No examination attempt exists at the authenticated student record.';
      }
      throw new Error(abortReason || 'Realtime Database did not commit the answer update.');
    }
    state.activeAttempt = transaction.snapshot.val();
  })();
  state.saveInFlight = operation;
  try {
    await operation;
    setSaveStatus('All changes saved');
  } catch (error) {
    setSaveStatus('Save failed · retrying', true);
    const message = isPermissionDenied(error)
      ? permissionMessage('saving this answer')
      : error?.message || 'Your answers could not be saved.';
    showToast(message);
    throw new Error(message, { cause: error });
  } finally {
    state.saveInFlight = null;
    state.isSaving = false;
    updateCompletion();
  }
}

function scheduleSave() {
  clearTimeout(state.saveTimeoutId);
  setSaveStatus('Unsaved changes');
  state.saveTimeoutId = window.setTimeout(() => {
    saveAnswers().catch(() => {});
  }, 450);
}

async function advancePhase() {
  if (state.isAdvancing) return;
  if (!isPhaseComplete(state.phase, phaseAnswers())) {
    showToast('Complete every question in this phase before continuing.');
    return;
  }

  state.isAdvancing = true;
  updateCompletion();
  clearTimeout(state.saveTimeoutId);
  try {
    await saveAnswers();
    const phase = state.phase;
    const confirmedAttempt = state.activeAttempt;
    if (!confirmedAttempt) {
      throw new Error('No confirmed examination attempt is available to continue. Refresh to reload your saved attempt.');
    }
    if (confirmedAttempt.attemptId && confirmedAttempt.attemptId !== state.attemptId) {
      throw new Error('The saved attempt ID does not match this session. Refresh to resume the correct attempt.');
    }

    const answerKey = phase === 1 ? 'mcqAnswers' : phase === 2 ? 'codingAnswers' : 'oralAnswers';
    let abortReason = '';
    const attemptRef = getAttemptReference(state.attemptId);
    const transaction = await runTransaction(attemptRef, seedFirstTransactionValue(confirmedAttempt, (attempt) => {
      if (!attempt) {
        abortReason = 'The examination attempt no longer exists in Realtime Database.';
        return;
      }
      if (attempt.attemptId && attempt.attemptId !== state.attemptId) {
        abortReason = 'The saved attempt ID does not match this session.';
        return;
      }
      if (attempt.status !== 'in_progress') {
        abortReason = `This examination attempt is ${attempt.status || 'unavailable'} and cannot continue.`;
        return;
      }
      if (attempt.currentPhase !== phase) {
        abortReason = `The saved attempt is on Phase ${attempt.currentPhase}, not Phase ${phase}. Refresh to resume the saved phase.`;
        return;
      }
      if (!isPhaseComplete(phase, attempt[answerKey])) {
        abortReason = `The saved Phase ${phase} answers are incomplete. Confirm all answers were saved before continuing.`;
        return;
      }
      attempt.attemptId = state.attemptId;
      attempt.currentPhase = phase + 1;
      attempt.phaseStartedAt = Date.now();
      attempt.phaseDurationSeconds = getPhaseDuration(phase + 1);
      return attempt;
    }), { applyLocally: false });
    if (!transaction.committed) {
      const currentAttempt = transaction.snapshot.val();
      if (!currentAttempt && !abortReason) {
        abortReason = "No examination attempt exists at the authenticated student's database path.";
      }
      throw new Error(abortReason || 'Realtime Database did not commit the phase transition.');
    }
    const attempt = transaction.snapshot.val();
    applyAttempt(attempt);
    state.questionIndex = 0;
    startTimer();
    renderQuestion();
  } catch (error) {
    showToast(isPermissionDenied(error)
      ? permissionMessage('saving answers or advancing the examination phase')
      : error?.message || 'Unable to continue to the next phase.');
  } finally {
    state.isAdvancing = false;
    updateCompletion();
  }
}

function showResult() {
  state.isSubmitted = true;
  if (state.timerId) clearInterval(state.timerId);
  state.tabListenerCleanup?.();
  window.location.replace('./result.html');
}

async function submitAttempt(reason) {
  if (!state.examStarted || state.isSubmitted || state.isSubmitting) return;
  state.isSubmitting = true;
  clearTimeout(state.saveTimeoutId);
  try {
    if (state.saveInFlight) await state.saveInFlight;
    await saveAnswers();
  } catch (error) {
    state.isSubmitting = false;
    setSaveStatus('Submission failed · answers were not saved', true);
    showToast(error?.message || 'Your answers could not be saved. Reconnect before submitting.');
    return;
  }
  state.isSubmitted = true;
  if (state.timerId) clearInterval(state.timerId);
  try {
    const attemptRef = getAttemptReference(state.attemptId);
    const confirmedAttempt = state.activeAttempt;
    if (!confirmedAttempt) throw new Error('No confirmed examination attempt is available to submit.');
    let abortReason = '';
    const transaction = await runTransaction(attemptRef, seedFirstTransactionValue(confirmedAttempt, (attempt) => {
      if (!attempt) {
        abortReason = 'The examination attempt no longer exists in Realtime Database.';
        return;
      }
      if (attempt.attemptId && attempt.attemptId !== state.attemptId) {
        abortReason = 'The saved attempt ID does not match this session.';
        return;
      }
      if (attempt.status !== 'in_progress') {
        abortReason = `This examination attempt is ${attempt.status || 'unavailable'} and cannot be submitted.`;
        return;
      }
      attempt.attemptId = state.attemptId;
      if (reason === 'completed'
        && (attempt.currentPhase !== 3
          || !isPhaseComplete(1, attempt.mcqAnswers)
          || !isPhaseComplete(2, attempt.codingAnswers)
          || !isPhaseComplete(3, attempt.oralAnswers))) {
        abortReason = 'The saved answers do not satisfy the examination completion requirements.';
        return;
      }
      attempt.examDomain = attempt.examDomain || 'Python + Data Analytics';
      attempt.studentName = attempt.studentName || state.user.displayName || 'Student';
      const score = evaluateAttempt(attempt);
      attempt.status = reason === 'tab-switch' ? 'terminated' : 'completed';
      attempt.terminationReason = reason === 'completed' ? null : reason;
      attempt.completedAt = Date.now();
      attempt.result = score.totalMarks;
      attempt.percentage = score.percentage;
      attempt.breakdown = score.breakdown;
      return attempt;
    }), { applyLocally: false });
    if (!transaction.committed) {
      const currentAttempt = transaction.snapshot.val();
      if (!currentAttempt && !abortReason) {
        abortReason = 'No examination attempt exists at the authenticated student database path.';
      }
      throw new Error(abortReason || 'Realtime Database did not commit the examination submission.');
    }
    state.activeAttempt = transaction.snapshot.val();
    state.pendingSubmissionReason = null;
    showResult();
  } catch (error) {
    state.isSubmitted = false;
    state.isSubmitting = false;
    state.pendingSubmissionReason = reason;
    setSaveStatus('Submission failed · retry required', true);
    showToast(isPermissionDenied(error)
      ? permissionMessage('submitting this examination')
      : error?.message || 'Unable to submit. Check your connection and retry.');
    if (reason === 'completed') submitDialog.showModal();
  } finally {
    state.isSubmitting = false;
  }
}

async function startExamination() {
  startExamButton.disabled = true;
  startExamButton.textContent = 'Preparing examination…';
  try {
    const attemptId = state.user.uid;
    const attemptRef = getAttemptReference(attemptId);
    const existingSnapshot = await get(attemptRef);
    let attempt = existingSnapshot.val();
    if (attempt && attempt.status !== 'in_progress') {
      window.location.replace('./dashboard.html');
      return;
    }
    if (!attempt) {
      const now = Date.now();
      const transaction = await runTransaction(attemptRef, (current) => {
        if (current) return current;
        return {
          attemptId,
          uid: state.user.uid,
          studentName: String(state.user.displayName || state.user.email || 'Student').slice(0, 120),
          email: String(state.user.email || ''),
          examId: 'python-data-analytics',
          examDomain: 'Python + Data Analytics',
          startedAt: now,
          completedAt: null,
          currentPhase: 1,
          phaseStartedAt: now,
          phaseDurationSeconds: getPhaseDuration(1),
          mcqAnswers: Array(mcqQuestions.length).fill(-1),
          codingAnswers: Array(codingQuestions.length).fill(''),
          oralAnswers: Array(oralQuestions.length).fill(''),
          status: 'in_progress',
          terminationReason: null,
          result: null,
          percentage: null,
          breakdown: null,
        };
      }, { applyLocally: false });
      attempt = transaction.snapshot.val();
      if (!transaction.committed || !attempt) {
        throw new Error('Realtime Database did not confirm creation of your examination attempt.');
      }
    }
    if (attempt.attemptId && attempt.attemptId !== attemptId) {
      throw new Error('The saved attempt ID does not match your authenticated student account.');
    }
    if (attempt.status !== 'in_progress') {
      window.location.replace('./dashboard.html');
      return;
    }
    attempt.attemptId = attemptId;
    applyAttempt(attempt);
    state.examStarted = true;
    state.tabListenerCleanup = watchExamTabSwitch(() => {
      submitAttempt('tab-switch');
    });
    instructionsView.classList.add('hidden');
    examView.classList.remove('hidden');
    startTimer();
    renderQuestion();
  } catch (error) {
    startExamButton.disabled = false;
    startExamButton.textContent = 'Start examination';
    const message = isPermissionDenied(error)
      ? permissionMessage('creating or reading this attempt')
      : error?.message || 'Unable to start the examination.';
    showToast(message);
  }
}

function moveQuestion(delta) {
  const nextIndex = state.questionIndex + delta;
  if (nextIndex < 0 || nextIndex >= phaseQuestions().length) return;
  if (delta > 0 && !hasAnswer(state.phase, state.questionIndex)) {
    showToast('Answer this question before moving ahead.');
    return;
  }
  state.questionIndex = nextIndex;
  renderQuestion();
}

startExamButton.addEventListener('click', startExamination);
previousButton.addEventListener('click', () => moveQuestion(-1));
nextButton.addEventListener('click', () => moveQuestion(1));
continueButton.addEventListener('click', () => {
  if (state.phase < 3) {
    advancePhase();
  } else if (isPhaseComplete(3, state.oralAnswers)) {
    submitDialog.showModal();
  } else {
    showToast('Answer all oral questions before submitting.');
  }
});

submitDialog.addEventListener('close', () => {
  if (submitDialog.returnValue === 'submit') submitAttempt('completed');
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace('./login.html');
    return;
  }
  state.user = user;
  try {
    const profile = await ensureUserProfile(user);
    if (profile.role === 'admin') {
      window.location.replace('./admin.html');
      return;
    }
    const snapshot = await get(getAttemptReference(user.uid));
    const attempt = snapshot.val();
    state.attemptId = user.uid;
    state.activeAttempt = attempt;
    if (attempt && attempt.status !== 'in_progress') {
      window.location.replace('./dashboard.html');
    } else if (attempt) {
      startExamButton.textContent = 'Resume examination';
    }
  } catch (error) {
    console.error('Unable to verify this examination session:', error);
    startExamButton.disabled = true;
    showToast(isPermissionDenied(error)
      ? permissionMessage("reading this student's examination attempt")
      : error?.message || 'Unable to verify your examination session.');
  }
});

window.addEventListener('online', () => {
  if (!state.examStarted || state.isSubmitted) return;
  if (state.pendingSubmissionReason) {
    submitAttempt(state.pendingSubmissionReason);
    return;
  }
  saveAnswers().catch(() => {});
});
