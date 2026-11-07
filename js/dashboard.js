import { auth, db, ref, get, onAuthStateChanged, watchConnectionStatus } from './firebase.js';
import { ensureUserProfile, userLogout } from './auth.js';

const nameNode = document.getElementById('studentName');
const emailNode = document.getElementById('studentEmail');
const welcomeNameNode = document.getElementById('welcomeName');
const domainButton = document.getElementById('domainCard');
const attemptStateNode = document.getElementById('attemptState');
const profileMessage = document.getElementById('profileMessage');
const historyEmpty = document.getElementById('historyEmpty');
const historyResult = document.getElementById('historyResult');
watchConnectionStatus(document.getElementById('networkStatus'));

document.getElementById('logoutButton').addEventListener('click', async () => {
  try {
    await userLogout();
  } catch (error) {
    profileMessage.textContent = `Unable to sign out: ${error.message}`;
  }
});

domainButton.addEventListener('click', () => {
  window.location.href = './exam.html';
});

document.getElementById('viewResultButton').addEventListener('click', () => {
  window.location.href = './result.html';
});

function showAttempt(attempt) {
  if (!attempt) {
    attemptStateNode.textContent = 'Your first attempt is available';
    domainButton.disabled = false;
    domainButton.textContent = 'Start examination';
    return;
  }

  if (attempt.status === 'in_progress') {
    attemptStateNode.textContent = 'Attempt in progress · one attempt only';
    domainButton.disabled = false;
    domainButton.textContent = 'Resume examination';
    return;
  }

  attemptStateNode.textContent = 'Attempt completed · second attempts are disabled';
  domainButton.disabled = true;
  domainButton.textContent = 'Attempt completed';
  historyEmpty.classList.add('hidden');
  historyResult.classList.remove('hidden');
  document.getElementById('historyStatus').textContent = attempt.status === 'terminated' ? 'Terminated' : 'Completed';
  document.getElementById('historyStatus').classList.toggle('is-terminated', attempt.status === 'terminated');
  document.getElementById('historyPercentage').textContent = `${attempt.percentage ?? 0}%`;
  document.getElementById('historyRing').style.setProperty('--score', `${attempt.percentage ?? 0}%`);
  document.getElementById('historyDate').textContent = attempt.completedAt
    ? `Submitted ${new Date(attempt.completedAt).toLocaleString()}`
    : 'Submission date unavailable';
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace('./login.html');
    return;
  }

  domainButton.disabled = true;
  domainButton.textContent = 'Loading...';
  profileMessage.textContent = '';
  try {
    const profile = await ensureUserProfile(user);
    if (profile.role === 'admin') {
      window.location.replace('./admin.html');
      return;
    }

    const attemptSnapshot = await get(ref(db, `attempts/${user.uid}`));
    const attempt = attemptSnapshot.val();
    const name = profile.name || user.displayName || 'Student';
    nameNode.textContent = name;
    welcomeNameNode.textContent = name.split(' ')[0];
    emailNode.textContent = profile.email || user.email || '';
    showAttempt(attempt);
  } catch (error) {
    console.error('Unable to load dashboard data:', error);
    domainButton.disabled = true;
    domainButton.textContent = 'Temporarily unavailable';
    profileMessage.textContent = error?.message || 'Unable to load your dashboard. Check your connection and try again.';
  }
});
