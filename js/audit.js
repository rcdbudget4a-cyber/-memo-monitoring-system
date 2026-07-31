/**
 * Audit Trail & Activity Logger Module
 * RCD Memorandum Monitoring System (PRO 4A)
 */

class AuditManager {
  constructor() {
    this.db = null;
  }

  init(db) {
    this.db = db;
  }

  async logAction(memoId, action, changes = {}, note = "") {
    if (!this.db || typeof firebase === "undefined") {
      console.log(`[AUDIT LOCAL] ${action} on ${memoId}`, changes);
      return;
    }

    try {
      const user = window.authManager?.currentUser;
      const profile = window.authManager?.currentProfile;

      const logEntry = {
        memoId: String(memoId || ""),
        action: action,
        userUid: user?.uid || "anonymous",
        userName: profile?.displayName || user?.email || "System User",
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        changes: changes || {},
        note: note || ""
      };

      await this.db.collection("audit_logs").add(logEntry);
    } catch (e) {
      console.warn("Could not record audit log entry:", e);
    }
  }
}

window.auditManager = new AuditManager();
