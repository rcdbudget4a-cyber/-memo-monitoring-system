# RCD Memo Monitoring System - Cloud Deployment Notes

This deployment copy intentionally excludes operational memo data from the public/static source package.

## Target services
- GitHub repository: source control
- Cloudflare Pages: static web application hosting
- Firebase project: `rcd-system`
- Firebase Authentication: authorized users only
- Cloud Firestore: protected memo records and user profiles

## Required Firebase Web App values
Open Firebase Console > `rcd-system` > Project settings > Your apps > Web app and copy the Web SDK configuration into `js/config.js`.

Required values:
- apiKey
- authDomain
- projectId
- storageBucket
- messagingSenderId
- appId

## Never commit
- `data/memos_db.json`
- exported Excel logbooks
- `js/memos_data.js`
- service account JSON files
- passwords or private keys

## Firestore
Deploy `firestore.rules` after enabling Authentication and Cloud Firestore.
