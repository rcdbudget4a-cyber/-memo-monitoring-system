# Local Storage to Firestore Data Migration Guide
**RCD Incoming/Outgoing Memorandum Monitoring System (PRO 4A)**

---

## Overview
Prior to this fix, memo records were stored in local browser `localStorage` and failed to sync to Cloud Firestore due to authentication and rules permission failures.

This document outlines the procedure to migrate existing local records to Cloud Firestore cleanly.

---

## One-Time Migration Steps

### Step 1: Backup Local Storage Records
1. Open the system on the computer containing the local records.
2. Sign in with an authorized Administrator account (`role: "admin"`).
3. Open the browser Developer Tools (`F12` -> `Console`).
4. Execute the export command:
   ```javascript
   app.backupDatabase();
   ```
5. A JSON backup file named `PRO4A_RCD_Memo_Database_Backup_YYYY-MM-DD.json` will be downloaded to your computer.

### Step 2: One-Time Bulk Sync to Firestore
1. Ensure the administrator profile document `users/{admin-uid}` has `role: "admin"` and `active: true` in Firestore.
2. In the browser Developer Tools console of the signed-in Administrator session, execute:
   ```javascript
   await app.syncAllDataToFirebase();
   ```
3. The system will batch-write all memo records to Firestore in chunks of 400 documents.
4. You will see a success toast: `✅ Synced [count] records to Firebase!`.

---

## Verification Across Computers

1. Open the deployed application URL on Computer B:
   https://memo-monitoring-system.rcdbudget4a.workers.dev/
2. Sign in with valid credentials (`duty.pnco@pro4a.pnp.gov.ph`).
3. Verify that all migrated records load automatically from Cloud Firestore in real time.
4. Add a test memo on Computer A and verify it appears on Computer B instantly via `onSnapshot` without refreshing.
