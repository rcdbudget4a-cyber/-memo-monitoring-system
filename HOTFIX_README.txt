RCD MEMO CLOUDFLARE + FIREBASE HOTFIX
====================================

Upload/replace these files in GitHub:
  js/config.js
  js/app.js
  index.html

What this fixes:
- Uses Firebase project: incoming-outgoing-memo
- Removes legacy local-password startup crash
- Uses Firebase Authentication for password handling
- Changes default login email to rcdbudget4a@gmail.com
- Cache-busts JavaScript files so Cloudflare/browser loads the new versions
- Shows a visible startup error instead of staying on "Loading clock..."

After GitHub commit and Cloudflare deployment:
1. Open the workers.dev site.
2. Press Ctrl+Shift+R.
3. The clock should start immediately.
4. Firebase login should appear if you are signed out.
5. Sign in with the Firebase Authentication password for rcdbudget4a@gmail.com.
6. Firestore memos should load if the memos collection contains records and Rules allow the signed-in user.

If the clock works but memos remain 0:
- the web app is running correctly;
- next verify that the Firestore memos collection actually contains the imported records.
