import { auth, db, ref, get, onAuthStateChanged, watchConnectionStatus } from './firebase.js';
import { ensureUserProfile, userLogout } from './auth.js';

const resultsBody = document.getElementById('resultsBody');
const emptyResults = document.getElementById('emptyResults');
const messageNode = document.getElementById('adminMessage');
const searchInput = document.getElementById('studentSearch');
const statusFilter = document.getElementById('statusFilter');
const sortSelect = document.getElementById('sortResults');
const refreshButton = document.getElementById('refreshButton');
const resultDialog = document.getElementById('studentResultDialog');
let allResults = [];
let loading = false;
watchConnectionStatus(document.getElementById('networkStatus'));

function setMessage(message, isError = false) {
  messageNode.textContent = message;
  messageNode.classList.toggle('is-error', isError);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function statusLabel(status) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function openResult(result) {
  document.getElementById('detailStudentName').textContent = result.studentName;
  document.getElementById('detailStudentEmail').textContent = result.email;
  document.getElementById('detailPercentage').textContent = result.percentage === null ? '—%' : `${result.percentage}%`;
  document.getElementById('detailMarks').textContent = result.totalMarks === null ? '— / 100' : `${result.totalMarks} / 100`;
  const breakdown = result.breakdown;
  document.getElementById('detailBreakdown').textContent = breakdown
    ? `${breakdown.mcq} / 40 · ${breakdown.coding} / 40 · ${breakdown.oral} / 20`
    : '—';
  document.getElementById('detailExam').textContent = result.examDomain;
  document.getElementById('detailStatus').textContent = statusLabel(result.status);
  document.getElementById('detailDate').textContent = formatDate(result.submittedAt);
  document.getElementById('detailReason').textContent = result.terminationReason || '—';
  renderAnswers(result.answers);
  resultDialog.showModal();
}

function renderAnswers(answers) {
  const container = document.getElementById('detailAnswers');
  container.replaceChildren();
  if (!answers) {
    const empty = document.createElement('p');
    empty.className = 'answers-empty';
    empty.textContent = 'No examination attempt has been recorded.';
    container.append(empty);
    return;
  }

  const phases = [
    { title: 'Phase 1 · Multiple choice', answers: answers.mcq, format: (answer) => Number.isInteger(answer) && answer >= 0 ? `Option ${String.fromCharCode(65 + answer)}` : 'Unanswered' },
    { title: 'Phase 2 · Coding', answers: answers.coding, format: (answer) => answer?.trim() || 'Unanswered' },
    { title: 'Phase 3 · Oral responses', answers: answers.oral, format: (answer) => answer?.trim() || 'Unanswered' },
  ];

  phases.forEach(({ title, answers: phaseAnswers, format }) => {
    const section = document.createElement('section');
    section.className = 'answer-phase';
    const heading = document.createElement('h4');
    heading.textContent = title;
    const list = document.createElement('ol');
    (phaseAnswers || []).forEach((answer) => {
      const item = document.createElement('li');
      item.textContent = format(answer);
      list.append(item);
    });
    section.append(heading, list);
    container.append(section);
  });
}

function visibleResults() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedStatus = statusFilter.value;
  const filtered = allResults.filter((result) => {
    const matchesQuery = `${result.studentName} ${result.email}`.toLowerCase().includes(query);
    return matchesQuery && (selectedStatus === 'all' || result.status === selectedStatus);
  });

  if (sortSelect.value === 'percentage-desc') {
    filtered.sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1));
  } else if (sortSelect.value === 'percentage-asc') {
    filtered.sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101));
  } else {
    filtered.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  }
  return filtered;
}

function renderResults() {
  const results = visibleResults();
  resultsBody.replaceChildren();
  document.getElementById('resultCount').textContent = `${results.length} ${results.length === 1 ? 'result' : 'results'}`;
  emptyResults.classList.toggle('hidden', results.length > 0);

  results.forEach((result) => {
    const row = document.createElement('tr');
    const student = document.createElement('td');
    student.className = 'student-cell';
    const studentName = document.createElement('strong');
    studentName.textContent = result.studentName;
    const email = document.createElement('span');
    email.textContent = result.email;
    student.append(studentName, email);

    const domain = document.createElement('td');
    domain.className = 'domain-cell';
    domain.dataset.label = 'Exam domain';
    domain.textContent = result.examDomain;
    const status = document.createElement('td');
    status.dataset.label = 'Status';
    const statusPill = document.createElement('span');
    statusPill.className = `table-status status-${result.status}`;
    statusPill.textContent = statusLabel(result.status);
    status.append(statusPill);
    const percentage = document.createElement('td');
    percentage.className = 'percentage-cell';
    percentage.dataset.label = 'Percentage';
    percentage.textContent = result.percentage === null ? '—' : `${result.percentage}%`;
    const marks = document.createElement('td');
    marks.dataset.label = 'Marks';
    marks.textContent = result.totalMarks === null ? '—' : `${result.totalMarks} / 100`;
    const submitted = document.createElement('td');
    submitted.className = 'date-cell';
    submitted.dataset.label = 'Submission date';
    submitted.textContent = formatDate(result.submittedAt);
    const action = document.createElement('td');
    action.className = 'action-cell';
    action.dataset.label = 'Details';
    const viewButton = document.createElement('button');
    viewButton.className = 'table-view-button';
    viewButton.type = 'button';
    viewButton.textContent = 'View result';
    viewButton.addEventListener('click', () => openResult(result));
    action.append(viewButton);
    row.append(student, domain, status, marks, percentage, submitted, action);
    resultsBody.append(row);
  });
}

async function loadAdminData() {
  if (loading) return;
  loading = true;
  refreshButton.disabled = true;
  refreshButton.textContent = 'Refreshing…';
  setMessage('Loading examination results…');
  try {
    const [usersSnapshot, attemptsSnapshot] = await Promise.all([
      get(ref(db, 'users')),
      get(ref(db, 'attempts')),
    ]);
    const users = usersSnapshot.val() || {};
    const attempts = attemptsSnapshot.val() || {};
    const students = Object.entries(users).filter(([, profile]) => profile?.role === 'student');
    allResults = students.map(([uid, profile]) => {
      const attempt = attempts[uid];
      return {
        uid,
        studentName: String(attempt?.studentName || profile.name || 'Student'),
        email: String(attempt?.email || profile.email || ''),
        examDomain: String(profile.examDomain || attempt?.examDomain || 'Python + Data Analytics'),
        status: String(attempt?.status || 'not_attempted'),
        totalMarks: Number.isFinite(attempt?.result) ? attempt.result : null,
        percentage: Number.isFinite(attempt?.percentage) ? attempt.percentage : null,
        breakdown: attempt?.breakdown || null,
        terminationReason: attempt?.terminationReason || null,
        submittedAt: attempt?.completedAt || null,
        answers: attempt ? {
          mcq: attempt.mcqAnswers,
          coding: attempt.codingAnswers,
          oral: attempt.oralAnswers,
        } : null,
      };
    });
    document.getElementById('totalStudents').textContent = students.length;
    document.getElementById('totalAttempts').textContent = Object.keys(attempts).length;
    document.getElementById('completedExams').textContent = Object.values(attempts).filter((attempt) => attempt.status === 'completed').length;
    document.getElementById('terminatedExams').textContent = Object.values(attempts).filter((attempt) => attempt.status === 'terminated').length;
    document.getElementById('updatedAt').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    document.getElementById('adminEmail').textContent = auth.currentUser?.email || '';
    setMessage('');
    renderResults();
  } catch (error) {
    console.error('Unable to load admin results:', error);
    setMessage(error?.message || 'Unable to load results. Check your connection and try again.', true);
  } finally {
    loading = false;
    refreshButton.disabled = false;
    refreshButton.textContent = 'Refresh results';
  }
}

document.getElementById('logoutButton').addEventListener('click', async () => {
  try {
    await userLogout();
  } catch (error) {
    setMessage(`Unable to sign out: ${error.message}`, true);
  }
});

refreshButton.addEventListener('click', loadAdminData);
searchInput.addEventListener('input', renderResults);
statusFilter.addEventListener('change', renderResults);
sortSelect.addEventListener('change', renderResults);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace('./login.html');
    return;
  }

  try {
    const profile = await ensureUserProfile(user);
    if (profile.role !== 'admin') {
      window.location.replace('./dashboard.html');
      return;
    }
    await loadAdminData();
  } catch (error) {
    console.error('Administrator authorization failed:', error);
    setMessage(error?.message || 'Unable to verify administrator access.', true);
  }
});
