import {
  auth,
  db,
  ref,
  runTransaction,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  getIdTokenResult,
  configureAuthPersistence,
} from './firebase.js';

const ADMIN_EMAIL = 'lala@gmail.com';
const ADMIN_UID = 'NdSGmG2MwbPob3us17UbXidZglW2';
let loginInProgress = false;
let roleCheckUid = null;
let roleCheckPromise = null;
let roleCheckAttemptedUid = null;
let registrationMode = false;

function showLoginMessage(message, type = '') {
  const messageNode = document.getElementById('loginMessage');
  if (!messageNode) return;

  messageNode.textContent = message;
  messageNode.className = 'form-message';
  if (type) messageNode.classList.add(type);
}

export async function ensureUserProfile(user, preferredName = '') {
  const isDesignatedAdmin = user.uid === ADMIN_UID;
  const token = await getIdTokenResult(user);
  const email = String(token.claims.email || user.email || '').trim();
  if (!email) throw new Error('Your Firebase account does not have an email address.');

  const matchesAdminEmail = email.toLowerCase() === ADMIN_EMAIL;
  if (matchesAdminEmail !== isDesignatedAdmin) {
    throw new Error('This account does not match the designated administrator identity.');
  }
  const isAdmin = isDesignatedAdmin && matchesAdminEmail;

  const profileRef = ref(db, `users/${user.uid}`);
  const transaction = await runTransaction(profileRef, (current) => {
    if (current?.role === 'admin' && !isAdmin) return;
    return {
      ...current,
      uid: user.uid,
      name: String(current?.name || preferredName || user.displayName || email.split('@')[0]).slice(0, 120),
      email,
      role: isAdmin ? 'admin' : 'student',
      examDomain: 'Python + Data Analytics',
      createdAt: Number(current?.createdAt) || Date.now(),
    };
  }, { applyLocally: false });

  const profile = transaction.snapshot.val();
  const expectedRole = isAdmin ? 'admin' : 'student';
  if (!profile || profile.uid !== user.uid || profile.email !== email || profile.role !== expectedRole) {
    throw new Error('Your saved account profile does not match your authenticated identity. Contact the portal administrator.');
  }
  return profile;
}

async function routeAuthenticatedUser(user) {
  if (roleCheckUid === user.uid && roleCheckPromise) return roleCheckPromise;
  if (roleCheckAttemptedUid === user.uid) return;

  roleCheckUid = user.uid;
  roleCheckAttemptedUid = user.uid;
  roleCheckPromise = (async () => {
    const profile = await ensureUserProfile(user);
    const destination = profile.role === 'admin' ? './admin.html' : './dashboard.html';
    if (window.location.pathname.endsWith('/login.html') || window.location.pathname === '/') {
      window.location.replace(destination);
    }
  })();

  try {
    await roleCheckPromise;
  } finally {
    roleCheckUid = null;
    roleCheckPromise = null;
  }
}

function getLoginErrorMessage(error) {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already uses this email. Sign in instead.';
    case 'auth/weak-password':
      return 'Choose a password with at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Unable to reach Firebase. Check your internet connection and try again.';
    case 'auth/api-key-not-valid':
      return 'Firebase rejected this Web App API key. Verify it in Firebase Console > Project settings > Your apps.';
    case 'PERMISSION_DENIED':
    case 'database/permission-denied':
      return 'Realtime Database denied access. Deploy the Spark database rules and verify this account.';
    default:
      return error?.message || 'Unable to verify your account. Please try again or contact the portal administrator.';
  }
}

function showLoginError(error) {
  console.error('Authentication or profile setup failed:', error);
  showLoginMessage(getLoginErrorMessage(error), 'error');
}

export function getAuthState() {
  return auth.currentUser;
}

export function ensureLoggedIn(redirectTo = './login.html') {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      const redirectPath = new URL(redirectTo, window.location.href).pathname;
      if (window.location.pathname !== redirectPath) window.location.replace(redirectTo);
    }
  });
}

export async function userLogout() {
  await signOut(auth);
}

if (document.getElementById('loginForm')) {
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const nameInput = document.getElementById('studentNameInput');
  const nameField = document.getElementById('studentNameField');
  const togglePasswordButton = document.getElementById('togglePassword');
  const submitButton = document.getElementById('loginButton');
  const modeButton = document.getElementById('authModeButton');
  const heading = document.getElementById('authHeading');
  const subtitle = document.getElementById('authSubtitle');

  togglePasswordButton?.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePasswordButton.textContent = isPassword ? 'Hide' : 'Show';
  });

  modeButton.addEventListener('click', () => {
    registrationMode = !registrationMode;
    nameField.classList.toggle('hidden', !registrationMode);
    nameInput.required = registrationMode;
    submitButton.querySelector('.button-text').textContent = registrationMode ? 'Create student account' : 'Login';
    modeButton.textContent = registrationMode ? 'Already registered? Sign in' : 'New student? Create an account';
    heading.textContent = registrationMode ? 'Create your account' : 'Welcome Back!';
    subtitle.textContent = registrationMode ? 'Register to take the examination.' : 'Sign in to continue your examination.';
    showLoginMessage('');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const name = nameInput.value.trim();
    if (!email || !password || (registrationMode && !name)) {
      showLoginMessage('Complete all required fields.', 'error');
      return;
    }
    if (registrationMode && email === ADMIN_EMAIL) {
      showLoginMessage('The administrator account cannot be created through student registration.', 'error');
      return;
    }

    submitButton.disabled = true;
    submitButton.querySelector('.button-text').textContent = registrationMode ? 'Creating account…' : 'Signing in...';
    submitButton.querySelector('.spinner').classList.remove('hidden');
    loginInProgress = true;
    roleCheckAttemptedUid = null;
    showLoginMessage('');

    try {
      await configureAuthPersistence();
      if (registrationMode) {
        const credentials = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credentials.user, { displayName: name });
        const profile = await ensureUserProfile(credentials.user, name);
        if (profile.role !== 'student') throw new Error('Student registration could not be verified.');
        showLoginMessage('Student account created. Your dashboard is opening.', 'success');
        window.location.replace('./dashboard.html');
      } else {
        const credentials = await signInWithEmailAndPassword(auth, email, password);
        await routeAuthenticatedUser(credentials.user);
        showLoginMessage('Login successful. Redirecting...', 'success');
      }
    } catch (error) {
      showLoginError(error);
      loginInProgress = false;
      submitButton.disabled = false;
      submitButton.querySelector('.button-text').textContent = registrationMode ? 'Create student account' : 'Login';
      submitButton.querySelector('.spinner').classList.add('hidden');
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (!loginInProgress && window.location.pathname.endsWith('login.html') && user
    && roleCheckAttemptedUid !== user.uid) {
    routeAuthenticatedUser(user).catch((error) => {
      showLoginError(error);
    });
  }
});
