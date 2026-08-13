RCD MEMO ATTACHMENT FIX
=======================

NEW ATTACHMENT ARCHITECTURE

Browser
  -> Cloudflare Worker (/api/drive-upload)
  -> Google Apps Script
  -> Google Drive

Firestore
  -> memo metadata only
  -> filename
  -> direct Google Drive file URL
  -> NO Base64 fileData

FILES CHANGED
-------------
1. _worker.js
2. js/app.js
3. index.html

HOW TO DEPLOY
-------------
Replace the same three files in the GitHub repository:
rcdbudget4a-cyber/-memo-monitoring-system

Commit the changes to main and allow Cloudflare to redeploy.

AFTER DEPLOYMENT
----------------
1. Open https://memo-monitoring-system.rcdbudget4a.workers.dev
2. Press Ctrl + Shift + R.
3. Sign in with the Firebase account.
4. Attach the PDF/JPG/PNG again.
5. Click Save Memorandum Entry.
6. The button should show: Uploading scan to Google Drive...
7. After the Drive upload succeeds, the memo metadata is saved to Firestore.

This fixes:
"Firebase save failed: The value of property fileData is longer than 1048487 bytes."

The existing Google Apps Script upload endpoint is reused. No Firebase Storage
upgrade is required for this attachment flow.
