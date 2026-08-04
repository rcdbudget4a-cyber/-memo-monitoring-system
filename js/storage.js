/**
 * Local & Cloud Storage Management Module
 * RCD Memorandum Monitoring System (PRO 4A)
 */

class StorageManager {
  constructor() {
    this.LOCAL_KEY = "RCD_MEMO_MONITORING_DATA";
  }

  loadInitialMemos() {
    if (typeof window.INITIAL_MEMOS !== "undefined" && Array.isArray(window.INITIAL_MEMOS)) {
      return window.INITIAL_MEMOS;
    }
    return [];
  }

  loadLocalMemos() {
    const seed = this.loadInitialMemos();
    try {
      const saved = localStorage.getItem(this.LOCAL_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= seed.length) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("LocalStorage access restricted or empty", e);
    }
    return seed;
  }

  saveLocalMemos(memos) {
    try {
      // Strip very large base64 fileData (>500KB) to prevent QuotaExceededError
      const cleanMemos = memos.map(m => {
        const copy = { ...m };
        if (copy.fileData && copy.fileData.length > 500000) {
          delete copy.fileData;
        }
        return copy;
      });
      localStorage.setItem(this.LOCAL_KEY, JSON.stringify(cleanMemos));
    } catch (e) {
      console.warn("LocalStorage save error", e);
    }
  }

  normalizeMemo(memo) {
    if (!memo) return null;
    const now = new Date().toISOString();

    // Dynamic workflow status mapping for historical records
    let computedWorkflowStatus = memo.workflowStatus;
    if (!computedWorkflowStatus) {
      if (memo.remarksStatus === "Transmitted to" || (memo.transmittedOffice && memo.transmittedOffice.trim().length > 2)) {
        computedWorkflowStatus = "TRANSMITTED";
      } else if (memo.remarksStatus && (memo.remarksStatus.includes("Concur") || memo.remarksStatus.includes("Approved") || memo.remarksStatus.includes("Signed"))) {
        computedWorkflowStatus = "APPROVED";
      } else {
        computedWorkflowStatus = "RECEIVED";
      }
    }

    return {
      // Existing Legacy Fields
      id: String(memo.id || `MEMO-${Date.now()}`),
      dateLogged: memo.dateLogged || new Date().toLocaleDateString("en-US"),
      time: memo.time || new Date().toLocaleTimeString("en-US"),
      receivedBy: memo.receivedBy || "Duty PNCO",
      originatingOffice: memo.originatingOffice || "ROD",
      subject: memo.subject || "Untitled Memorandum",
      actionRequired: memo.actionRequired || "For Info",
      remarksStatus: memo.remarksStatus || "Received",
      transmittedOffice: memo.transmittedOffice || "",
      dateReceived: memo.dateReceived || "",
      driveLink: memo.driveLink || "",
      pages: parseInt(memo.pages) || 1,
      fileName: memo.fileName || "",
      fileData: memo.fileData || "",

      // Extended Phase 2 Workflow Attributes
      memoType: memo.memoType || (String(memo.id).toUpperCase().startsWith("ORCD") ? "OUTGOING" : "INCOMING"),
      workflowStatus: computedWorkflowStatus,
      priority: memo.priority || "NORMAL",
      assignedSection: memo.assignedSection || "RCD",
      actionOfficer: memo.actionOfficer || "",
      supervisingOfficer: memo.supervisingOfficer || "",
      dueDate: memo.dueDate || "",
      nextFollowUpDate: memo.nextFollowUpDate || "",
      reasonForDelay: memo.reasonForDelay || "",
      dateAssigned: memo.dateAssigned || "",
      dateAcknowledged: memo.dateAcknowledged || "",
      dateCompleted: memo.dateCompleted || "",
      createdByUid: memo.createdByUid || "",
      createdByName: memo.createdByName || memo.receivedBy || "Duty PNCO",
      updatedByUid: memo.updatedByUid || "",
      updatedByName: memo.updatedByName || "",
      createdAt: memo.createdAt || now,
      updatedAt: memo.updatedAt || now,

      // Soft Delete Attributes
      schemaVersion: memo.schemaVersion || APP_CONFIG.SCHEMA_VERSION,
      isDeleted: memo.isDeleted === true,
      deletedAt: memo.deletedAt || "",
      deletedByUid: memo.deletedByUid || "",
      deleteReason: memo.deleteReason || ""
    };
  }
}

window.storageManager = new StorageManager();
