# Firebase Setup & Deployment Guide
**RCD Incoming/Outgoing Memorandum Monitoring System (PRO 4A)**

---

## 1. Firebase Project Overview
- **Project ID**: `incoming-outgoing-memo`
- **Auth Domain**: `incoming-outgoing-memo.firebaseapp.com`
- **Firestore Database**: Production Mode

---

## 2. Authentication Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/) -> Select **incoming-outgoing-memo**.
2. Navigate to **Authentication** -> **Sign-in method**.
3. Enable **Email/Password** sign-in provider.
4. Go to **Authentication** -> **Settings** -> **Authorized domains**.
5. Add the following authorized domains:
   - `memo-monitoring-system.rcdbudget4a.workers.dev`
   - `rcdbudget4a.workers.dev`
   - `localhost`
6. Create the primary duty account under **Authentication** -> **Users**:
   - **Email**: `duty.pnco@pro4a.pnp.gov.ph`
   - **Password**: Set a secure password.
   - Note down the generated **User UID** (e.g. `aB1cD2eF3gH4...`).

---

## 3. Firestore Database & Security Rules Deployment

1. Go to **Firestore Database** in Firebase Console.
2. Ensure the database is created in **Production mode**.
3. Deploy the updated `firestore.rules` using Firebase CLI:
   ```bash
   npx -y firebase-tools deploy --only firestore:rules --project incoming-outgoing-memo
   ```
   *Or manually copy the contents of `firestore.rules` into **Firestore Database -> Rules** in the Firebase Console and click **Publish**.*

---

## 4. Provisioning User Profiles in `users/{uid}`

Every authenticated Firebase user MUST have a document under the `users` collection matching their Firebase Auth `uid`.

### Option A: Firebase Console (GUI)
1. Go to **Firestore Database** -> **Start collection**.
2. Collection ID: `users`
3. Document ID: `<firebase-auth-uid>` (e.g. `aB1cD2eF3gH4...`)
4. Fields:
   ```json
   {
     "uid": "<firebase-auth-uid>",
     "email": "duty.pnco@pro4a.pnp.gov.ph",
     "displayName": "Duty PNCO",
     "role": "records_admin",
     "section": "RCD",
     "active": true
   }
   ```

### Option B: Bootstrap Script (Node.js)
1. Download Service Account Key JSON from Firebase Console -> Project Settings -> Service Accounts.
2. Save file as `serviceAccountKey.json` in root folder.
3. Run:
   ```bash
   node scripts/bootstrap-admin.js <firebase-user-uid> records_admin "Duty PNCO" duty.pnco@pro4a.pnp.gov.ph
   ```

---

## 5. Supported User Roles

| Role Key | Role Name | Permissions |
|---|---|---|
| `admin` | Administrator | Full access, user profile management, permanent deletion, data import |
| `records_admin` | Records Admin | Read, log, edit, transmit, and soft-delete memos |
| `duty_pnco` | Duty PNCO | Read, log, edit, transmit memos, print duty journal |
| `action_officer` | Action Officer | Read, update assigned action status |
| `approver` | Approver | Read, concur, review memos |
| `viewer` | Viewer | Read-only access |
