import { auth, db, ref, get, onAuthStateChanged } from './firebase.js';
import { ensureUserProfile } from './auth.js';

const nameNode = document.getElementById('studentNameResult');
const finalPercentageNode = document.getElementById('finalPercentage');
const percentageText = document.getElementById('percentageText');
const scoreRing = document.getElementById('scoreRing');
const statusNode = document.getElementById('resultStatus');
const submittedAtNode = document.getElementById('resultSubmittedAt');
const messageNode = document.getElementById('resultMessage');

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace('./login.html');
    return;
  }

  try {
    const profile = await ensureUserProfile(user);
    if (profile.role === 'admin') {
      window.location.replace('./admin.html');
      return;
    }
    const snapshot = await get(ref(db, `attempts/${user.uid}`));
    const attempt = snapshot.val();
    if (!attempt || !['completed', 'terminated'].includes(attempt.status)) {
      window.location.replace('./dashboard.html');
      return;
    }

    const percentage = Math.max(0, Math.min(100, Number(attempt.percentage) || 0));
    nameNode.textContent = profile.name || user.displayName || 'Student';
    finalPercentageNode.textContent = `${percentage}%`;
    percentageText.textContent = `${percentage}%`;
    scoreRing.style.setProperty('--percentage', percentage);
    statusNode.textContent = attempt.status === 'terminated'
      ? 'Terminated · result from saved answers'
      : 'Examination completed';
    statusNode.classList.toggle('is-terminated', attempt.status === 'terminated');
    submittedAtNode.textContent = attempt.completedAt
      ? `Submitted ${new Date(attempt.completedAt).toLocaleString()}`
      : '';
  } catch (error) {
    console.error('Unable to load the examination result:', error);
    messageNode.textContent = error?.message || 'Unable to load your result. Check your connection and try again.';
  }
});
