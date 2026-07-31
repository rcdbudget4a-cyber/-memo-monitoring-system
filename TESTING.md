# 🧪 Verification & Operational Testing Checklist

**System**: RCD Incoming/Outgoing Memorandum Monitoring System (PRO 4A)  
**Target Environment**: GitHub Pages / Local Node Server (`http://localhost:3000`)

---

## 1. Authentication & Access Control

- [x] **Officer Sign-In**: Clicking `🔑 Secure Officer Sign In` authenticates user immediately.
- [x] **Role Display**: Authenticated user badge shows `Officer Name` and role (`RECORDS_ADMIN`).
- [x] **Logout**: Clicking `🚪 Logout` clears session and re-displays security login modal.

---

## 2. Data Integrity & Seed Loading

- [x] **Total Seed Count**: Verified `js/memos_data.js` contains exactly **1,210 historical records** (`MEMO-2026-001` to `MEMO-2026-1210`).
- [x] **Non-Destructive Normalization**: Records missing version 2 schema fields are filled at runtime dynamically without modifying seed file.

---

## 3. Real-Time Cloud Synchronization

- [x] **Firebase Firestore**: Real-time `onSnapshot` listener syncs memo updates to collection `memos`.
- [x] **Google Apps Script**: Background POST upload sends scanned PDF documents directly to Google Drive storage folder `1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh`.

---

## 4. Working-Day Aging & Deadline Tracking

- [x] **Working-Day Calculation**: Excludes Saturdays and Sundays from age counts.
- [x] **Visible Status Badges**: Displays `⏱️ 1 working day(s)`, `⏰ DUE TODAY`, or `⚠️ OVERDUE` text badges alongside status indicators.

---

## 5. Record Creation, Edit & OCR Scanning

- [x] **Log Incoming Memo**: Submits new entry with instant <10ms UI update.
- [x] **Input Outgoing RCD Memo**: Fetches live CSV from RCD Control Google Sheet, auto-assigns next vacant Control No. (e.g., `ORCD-0416`).
- [x] **Front Page OCR Scanner**: Tesseract.js & PNP regex parser extracts Subject and Originating Office (`ROD`, `RCD`, `RID`, etc.) and pre-fills form.

---

## 6. Document Preview & Export

- [x] **Native PDF Viewer**: Clicking `📄 View PDF File` opens the exact uploaded PDF document directly inside fullscreen Document Viewer Modal (`#pdf-viewer-modal`).
- [x] **Native Excel Export**: Exports active or filtered logbook records to `.xlsx` spreadsheet via SheetJS.
- [x] **Batch Transmit**: Mass-updates selected memo checkboxes to `Transmitted to`.
- [x] **Print Routing Slip**: Renders official PNP Transmittal / Routing Slip HTML preview and triggers print dialog.
- [x] **Print Duty Journal**: Generates RCD (R6) Duty Journal report matching official reference format.

---

## 7. Soft Delete & Admin Recycle Bin

- [x] **Soft Delete**: Clicking delete icon prompts for mandatory deletion reason, sets `isDeleted: true`, and logs audit entry.
- [x] **Recycle Bin**: Admin modal lists soft-deleted records and allows 1-click `🔄 Restore` back to active logbook.

---

## 8. Mobile & Responsive Layout

- [x] **Responsive Navigation**: System navigation bar (`All Memos`, `Incoming`, `Outgoing`, `Recycle Bin`) adapts seamlessly across mobile phones and desktop monitors.
