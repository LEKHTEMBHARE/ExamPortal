# CodeForSimples Exam Portal

Responsive student and admin examination portal built with HTML, CSS, Vanilla JavaScript, Firebase Authentication, and Realtime Database. The current workspace is a static HTML/ES-module frontend; it does not contain a Vite configuration or use a framework.

## Spark-plan setup

The app uses the existing Firebase Web App configuration in `js/firebase.js` (`examportal-752db`). It does not initialize Cloud Functions or Firebase Storage.

1. Enable Email/Password under Firebase Console → Authentication → Sign-in method.
2. Add the exact Live Server origin (`http://127.0.0.1:5500` or `http://localhost:5500`) to Authentication → Settings → Authorized domains.
3. The designated Firebase Auth admin account `lala@gmail.com` (UID `NdSGmG2MwbPob3us17UbXidZglW2`) must already exist and have its admin role provisioned at `users/{uid}` through trusted Firebase Console/CLI access. Email verification is not required. Admin access is bound to this exact authenticated UID, matching token email, and pre-provisioned database role; public student registration rejects this address.
4. Create/enable Realtime Database in the same project and deploy `database/database-rules.json`:

   ```powershell
   npx firebase-tools deploy --only database --project examportal-752db
   ```

5. To host the static site on Firebase Hosting, deploy only Hosting (available on Spark within its free quotas):

   ```powershell
   npx firebase-tools deploy --only hosting --project examportal-752db
   ```

   Hosting can also be run locally with VS Code Live Server. This repository does not currently have Vite scripts or Vite dependencies.

## Authentication and data

- Students can register with email/password or sign in with an existing Firebase Authentication account.
- A profile is created once at `users/{uid}` and updated only through authenticated database rules. Sign-out does not delete profile or attempt data.
- The student's single attempt is stored at `attempts/{uid}`. Its stable `attemptId` is the authenticated UID, matching the database key so refreshes and phase changes reuse the same record. Legacy in-progress attempts without the `attemptId` field retain their existing key and are assigned the ID on the next answer save. The record contains saved answer arrays, exam status, marks/breakdown, percentage, and submission timestamp.
- The dashboard and result page read the persisted profile/attempt after authentication. An existing attempt can be resumed only while it is in progress; completed or terminated attempts cannot be started again.
- The admin page reads the student profiles and attempts directly from Realtime Database. Its collection reads are denied by rules unless the Firebase ID token belongs to the designated UID, its email matches `lala@gmail.com`, and its pre-provisioned database profile has `role == 'admin'`.

## Exam

- Phase 1: 20 MCQs, 10 minutes, 40 marks.
- Phase 2: 2 Python coding questions, 10 minutes, 40 marks.
- Phase 3: 5 typed answers, 20 marks.
- Answers are written to Realtime Database as the student works. A final submission or tab-switch termination stores the final client-calculated marks and percentage. Existing question content, navigation, and result presentation are preserved.

## Spark-plan security limitations

Realtime Database rules enforce per-UID reads/writes, profile identity/role constraints, answer shapes, and one attempt record per UID. Admin-wide reads require the designated UID, a matching signed email claim, and the pre-provisioned `users/{uid}.role == 'admin'` record. Email verification is intentionally not an authorization condition; the fixed UID and trusted role provisioning are the security boundary. Client rules prevent creating or promoting an admin profile; the designated profile was provisioned through authenticated Firebase CLI access. A frontend email comparison alone is not sufficient. Do not loosen these rules or deploy public read/write access.

Without a trusted server (Cloud Functions or another trusted backend), these controls cannot make exam scoring tamper-proof. Students control the browser and can alter the JavaScript, timestamps, answers, and marks submitted for their own in-progress record. Because grading is done in the browser, the MCQ answer key and coding rubric are also inspectable by students. Rules validate score ranges, phase completion, and lock a record after submission, but cannot independently grade answers or prove a submitted score was calculated from them. Student-submitted scores and client timers are therefore not suitable for high-stakes certification. A strict guarantee against score forgery requires trusted server-side grading, which is outside the requested Spark-only architecture.

RTDB rules cannot recover an answer if the browser goes offline before it reaches Firebase. Use a stable connection during the exam; saved server data persists across logout, refresh, and browser restarts.

## Development and tests

Open `login.html` with VS Code Live Server. Run the local scoring/completion tests with:

```powershell
npm test
npm run test:rules
```

`npm run test:rules` starts the local Realtime Database emulator and tests student/admin access, phase completion, one-attempt behavior, and final-record locking. Real Auth registration/sign-in still require the configured Firebase project, enabled Email/Password provider, a live Realtime Database, and deployed rules.
