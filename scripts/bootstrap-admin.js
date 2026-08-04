/**
 * Admin User Profile Provisioning Script
 * RCD Memorandum Monitoring System (PRO 4A)
 *
 * Usage with Node.js & Firebase Admin SDK:
 * 1. Download Service Account Key JSON from Firebase Console -> Project Settings -> Service accounts
 * 2. Save key file as `serviceAccountKey.json` in root or pass as environment variable
 * 3. Run: node scripts/bootstrap-admin.js <firebase-user-uid> [role] [displayName] [email]
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '..', 'serviceAccountKey.json');

if (!fs.existsSync(keyPath)) {
  console.error("❌ Service Account Key file not found at:", keyPath);
  console.log("\nINSTRUCTIONS:");
  console.log("1. Go to Firebase Console -> Project Settings -> Service Accounts");
  console.log("2. Click 'Generate new private key' and save as serviceAccountKey.json in project root.");
  console.log("3. Re-run this script.\n");
  process.exit(1);
}

const serviceAccount = require(keyPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function bootstrapUser() {
  const args = process.argv.slice(2);
  const uid = args[0];
  const role = args[1] || "records_admin";
  const displayName = args[2] || "Duty PNCO";
  const email = args[3] || "duty.pnco@pro4a.pnp.gov.ph";

  if (!uid) {
    console.error("❌ Error: Firebase User UID is required.");
    console.log("Usage: node scripts/bootstrap-admin.js <firebase-user-uid> [role] [displayName] [email]");
    console.log("Example: node scripts/bootstrap-admin.js XyZ123ABC456 admin 'Duty PNCO' duty.pnco@pro4a.pnp.gov.ph");
    process.exit(1);
  }

  const userProfile = {
    uid: uid,
    email: email,
    displayName: displayName,
    role: role,
    section: "RCD",
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('users').doc(uid).set(userProfile, { merge: true });
    console.log("✅ Successfully created/updated user profile in Firestore!");
    console.log("Document Path: users/" + uid);
    console.log("Profile Details:", JSON.stringify(userProfile, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to create user profile in Firestore:", err);
    process.exit(1);
  }
}

bootstrapUser();
