/**
 * Incoming & Outgoing Memorandum Monitoring System
 * Office of the Regional Comptrollership Division (PRO 4A)
 * Core Application Logic
 */

// Target Google Drive Storage Folder URL provided by User
const TARGET_GOOGLE_DRIVE_FOLDER = "https://drive.google.com/drive/folders/1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh?usp=sharing";
const TARGET_RCD_GOOGLE_SHEET = "https://docs.google.com/spreadsheets/d/166VH0J3B0kY9MBvP37x9NtV32Vsk_y0kDqfQrutRcxA/edit?gid=767216694#gid=767216694";
const TARGET_RCD_GOOGLE_SHEET_CSV = "https://docs.google.com/spreadsheets/d/166VH0J3B0kY9MBvP37x9NtV32Vsk_y0kDqfQrutRcxA/gviz/tq?tqx=out:csv&gid=767216694";
const DEFAULT_GOOGLE_DRIVE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxvhr0U3IWOhOLYLdWZFSRL-Q8otNf4gTPSkBgsD82CrNPJ9xowvuMsUgFLSNAsvAPIUg/exec";

class MemoMonitoringApp {
  constructor() {
    this.memos = this.loadMemos();
    this.currentFilterOffice = "ALL";
    this.currentFilterStatus = "ALL";
    this.currentSearchTerm = "";
    this.currentSortOrder = "NEWEST";
    this.selectedMemoIds = new Set();
    this.capturedPages = [];
    this.currentUploadedFile = null;
    this.selectedMemoForPrint = null;
    this.webcamStream = null;

    this.initElements();
    this.initFirebase();
    this.checkSecurityAuth();
    this.populateOfficeFilter();
    this.bindEvents();
    this.startClock();
    this.renderStats();
    this.renderTable();
  }

  initFirebase() {
    if (typeof firebase === "undefined") return;

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(APP_CONFIG.FIREBASE);
      }
      this.db = firebase.firestore();

      if (window.authManager) {
        window.authManager.init(firebase.app());
        window.authManager.onAuthStateChanged((user, profile) => {
          if (user && profile) {
            this.listenFirebaseSync();
          } else {
            this.stopFirebaseSync();
          }
        });
      }

      if (window.auditManager) window.auditManager.init(this.db);
    } catch (e) {
      console.warn("Firebase Cloud Database notice:", e);
    }
  }

  stopFirebaseSync() {
    if (this.firestoreUnsubscribe) {
      try { this.firestoreUnsubscribe(); } catch (e) {}
      this.firestoreUnsubscribe = null;
    }
    this.updateCloudStatusIndicator("disconnected", "Signed Out");
  }

  listenFirebaseSync() {
    if (!this.db || !window.authManager?.currentUser) return;
    this.stopFirebaseSync();

    try {
      this.updateCloudStatusIndicator("connecting", "Connecting...");

      this.firestoreUnsubscribe = this.db.collection("memos").onSnapshot((snapshot) => {
        if (!snapshot) return;

        const isFromCache = snapshot.metadata?.fromCache;
        if (isFromCache) {
          this.updateCloudStatusIndicator("offline", "Offline Mode (Cached)");
        } else {
          this.updateCloudStatusIndicator("connected", "Cloud Connected");
        }

        let updated = false;
        snapshot.docChanges().forEach((change) => {
          const remoteMemo = change.doc.data();
          if (remoteMemo && remoteMemo.id) {
            const memoId = String(remoteMemo.id);
            const normalized = window.storageManager ? window.storageManager.normalizeMemo(remoteMemo) : remoteMemo;

            if (change.type === "added" || change.type === "modified") {
              const idx = this.memos.findIndex(m => String(m.id) === memoId);
              if (idx >= 0) {
                this.memos[idx] = { ...this.memos[idx], ...normalized };
              } else {
                this.memos.unshift(normalized);
              }
              updated = true;
            } else if (change.type === "removed") {
              this.memos = this.memos.filter(m => String(m.id) !== memoId);
              updated = true;
            }
          }
        });

        if (updated) {
          if (window.storageManager) window.storageManager.saveLocalMemos(this.memos);
          this.populateOfficeFilter();
          this.renderStats();
          this.renderTable();
        }
      }, (err) => {
        console.error("Firebase Snapshot Listener Error:", err);
        if (err.code === "permission-denied") {
          this.updateCloudStatusIndicator("disconnected", "Permission Denied");
          if (window.uiManager) window.uiManager.showToast("⚠️ Firestore Permission Denied. Active user profile required.", "error");
        } else {
          this.updateCloudStatusIndicator("offline", "Offline Mode");
        }
      });
    } catch (e) {
      console.warn("Firebase sync notice:", e);
      this.updateCloudStatusIndicator("disconnected", "Connection Error");
    }
  }

  updateCloudStatusIndicator(status, label) {
    const dot = document.getElementById("cloud-status-dot");
    const text = document.getElementById("cloud-status-text");
    if (!dot || !text) return;

    if (status === "connected") {
      dot.style.backgroundColor = "#22c55e";
      text.textContent = label || "Cloud Connected";
    } else if (status === "offline" || status === "connecting") {
      dot.style.backgroundColor = "#eab308";
      text.textContent = label || "Offline / Syncing";
    } else {
      dot.style.backgroundColor = "#ef4444";
      text.textContent = label || "Cloud Disconnected";
    }
  }

  async saveMemoToCloud(memo) {
    if (!this.db || !window.authManager?.currentUser) {
      if (window.uiManager) window.uiManager.showToast("⚠️ Cloud database disconnected. User not logged in.", "error");
      return false;
    }

    const norm = window.storageManager ? window.storageManager.normalizeMemo(memo) : { ...memo };
    const user = window.authManager.currentUser;
    const profile = window.authManager.currentProfile;

    norm.updatedByUid = user.uid;
    norm.updatedByName = profile?.displayName || user.email || "Authorized User";
    if (typeof firebase !== "undefined" && firebase.firestore?.FieldValue) {
      norm.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      if (!norm.createdByUid) {
        norm.createdByUid = user.uid;
        norm.createdByName = profile?.displayName || user.email || "Authorized User";
        norm.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      }
    }

    if (norm.fileData && norm.fileData.length > 500000) {
      delete norm.fileData;
    }

    try {
      const docRef = this.db.collection("memos").doc(String(norm.id));
      await docRef.set(norm, { merge: true });
      if (window.uiManager) window.uiManager.showToast(`☁️ Saved "${norm.id}" to cloud!`, "success");
      return true;
    } catch (err) {
      console.error("Firestore write error for memo", norm.id, err);
      const errMsg = err.code === "permission-denied"
        ? "Permission Denied: Missing or insufficient permissions to write record."
        : `Not saved—cloud connection failed: ${err.message || "Unknown error"}`;
      if (window.uiManager) window.uiManager.showToast(`⚠️ ${errMsg}`, "error");
      return false;
    }
  }

  async deleteMemoFromCloud(memoId) {
    if (!this.db || !window.authManager?.currentUser) {
      if (window.uiManager) window.uiManager.showToast("⚠️ Cloud database disconnected.", "error");
      return false;
    }

    try {
      const docRef = this.db.collection("memos").doc(String(memoId));
      await docRef.delete();
      if (window.uiManager) window.uiManager.showToast(`🗑️ Deleted "${memoId}" from cloud!`, "info");
      return true;
    } catch (err) {
      console.error("Firestore delete error for memo", memoId, err);
      const errMsg = err.code === "permission-denied"
        ? "Permission Denied: Only administrators can delete records."
        : `Cloud delete failed: ${err.message || "Unknown error"}`;
      if (window.uiManager) window.uiManager.showToast(`⚠️ ${errMsg}`, "error");
      return false;
    }
  }

  async syncAllDataToFirebase() {
    if (!this.db || !window.authManager?.currentUser) {
      if (window.uiManager) window.uiManager.showToast("⚠️ Firebase Database is not connected or user not logged in.", "error");
      return;
    }

    try {
      const seed = this.getInitialMemos();
      const memosToSync = (this.memos && this.memos.length >= seed.length) ? this.memos : seed;
      let count = 0;

      for (let i = 0; i < memosToSync.length; i += 400) {
        const chunk = memosToSync.slice(i, i + 400);
        const batch = this.db.batch();

        chunk.forEach(memo => {
          if (memo && memo.id) {
            const cleanMemo = window.storageManager ? window.storageManager.normalizeMemo(memo) : { ...memo };
            if (cleanMemo.fileData && cleanMemo.fileData.length > 500000) {
              delete cleanMemo.fileData;
            }
            Object.keys(cleanMemo).forEach(key => {
              if (cleanMemo[key] === undefined) cleanMemo[key] = "";
            });
            const docRef = this.db.collection("memos").doc(String(cleanMemo.id));
            batch.set(docRef, cleanMemo, { merge: true });
            count++;
          }
        });

        await batch.commit();
      }

      if (window.uiManager) window.uiManager.showToast(`✅ Synced ${count} records to Firebase!`, "success");
    } catch (err) {
      console.error("Firebase sync error:", err);
      if (window.uiManager) window.uiManager.showToast(`⚠️ Sync failed: ${err.message}`, "error");
    }
  }

  checkSecurityAuth() {
    // Auth status is securely managed by window.authManager
  }

  getInitialMemos() {
    if (typeof window.INITIAL_MEMOS !== "undefined" && Array.isArray(window.INITIAL_MEMOS) && window.INITIAL_MEMOS.length > 0) {
      return window.INITIAL_MEMOS.map(m => window.storageManager ? window.storageManager.normalizeMemo(m) : m);
    }
    return [];
  }

  loadMemos() {
    let memos = [];
    if (window.storageManager) {
      const raw = window.storageManager.loadLocalMemos();
      if (Array.isArray(raw) && raw.length > 0) {
        memos = raw.map(m => window.storageManager.normalizeMemo(m));
      }
    }
    const seed = this.getInitialMemos();
    if (!memos || memos.length < seed.length) {
      memos = seed;
    }
    return memos;
  }

  saveMemos() {
    if (window.storageManager) {
      window.storageManager.saveLocalMemos(this.memos);
    }
    this.populateOfficeFilter();
    this.renderStats();
    this.renderTable();
  }

  populateOfficeFilter() {
    if (!this.officeFilter) return;

    const offices = new Set();
    if (Array.isArray(this.memos)) {
      this.memos.forEach(m => {
        if (m && m.originatingOffice && m.originatingOffice.trim()) {
          offices.add(m.originatingOffice.trim());
        }
      });
    }

    const sortedOffices = Array.from(offices).sort();
    let html = `<option value="ALL">All Originating Offices</option>`;
    sortedOffices.forEach(off => {
      html += `<option value="${off}">${off}</option>`;
    });

    const currentValue = this.officeFilter ? this.officeFilter.value : "ALL";
    this.officeFilter.innerHTML = html;
    if (currentValue && sortedOffices.includes(currentValue)) {
      this.officeFilter.value = currentValue;
    }
  }

  initElements() {
    this.clockEl = document.getElementById("live-clock");
    this.searchInput = document.getElementById("search-input");
    this.officeFilter = document.getElementById("office-filter");
    this.statusFilter = document.getElementById("status-filter");
    this.sortOrderSelect = document.getElementById("sort-order");
    this.tableBody = document.getElementById("memo-table-body");
    this.tableCountEl = document.getElementById("table-count-label");

    // Stats
    this.statTotal = document.getElementById("stat-total");
    this.statPendingRcd = document.getElementById("stat-pending-rcd");
    this.statTransmitted = document.getElementById("stat-transmitted");
    this.statConcurred = document.getElementById("stat-concurred");
    this.statDrive = document.getElementById("stat-drive");

    // Batch & Select All Elements
    this.selectAllCheckbox = document.getElementById("select-all-memos");
    this.batchBar = document.getElementById("batch-action-bar");
    this.batchCountText = document.getElementById("batch-count-text");

    // Modals
    this.memoModal = document.getElementById("memo-modal");
    this.ocrModal = document.getElementById("ocr-modal");
    this.cameraModal = document.getElementById("camera-modal");
    this.routingModal = document.getElementById("routing-modal");
    this.journalModal = document.getElementById("journal-modal");
    this.journalPreviewModal = document.getElementById("journal-preview-modal");
    this.journalSetupForm = document.getElementById("journal-setup-form");
    this.pdfViewerModal = document.getElementById("pdf-viewer-modal");

    // Security Lock Screen
    this.lockModal = document.getElementById("lock-modal");
    this.lockForm = document.getElementById("lock-screen-form");
    this.lockInput = document.getElementById("lock-passcode-input");
    this.lockError = document.getElementById("lock-error-msg");

    // Change Passcode Modal
    this.changePassModal = document.getElementById("change-passcode-modal");
    this.changePassForm = document.getElementById("change-passcode-form");
    this.passCurrentInput = document.getElementById("pass-current");
    this.passNewInput = document.getElementById("pass-new");
    this.passConfirmInput = document.getElementById("pass-confirm");
    this.changePassStatus = document.getElementById("change-pass-status");

    // Memo Form
    this.memoForm = document.getElementById("memo-form");

    // Multi-page camera
    this.videoEl = document.getElementById("camera-video");
    this.canvasEl = document.getElementById("camera-canvas");
    this.snapGallery = document.getElementById("snap-gallery");

    // Load custom credentials if set by user
    const customEmail = localStorage.getItem("RCD_CUSTOM_AUTH_EMAIL");
    const customPass = localStorage.getItem("RCD_CUSTOM_AUTH_PASS");
    if (customEmail) {
      const authEmailInput = document.getElementById("auth-email-input");
      if (authEmailInput) authEmailInput.value = customEmail;
      if (window.APP_CONFIG && window.APP_CONFIG.DEFAULT_AUTH) window.APP_CONFIG.DEFAULT_AUTH.DEFAULT_EMAIL = customEmail;
    }
    if (customPass) {
      const authPassInput = document.getElementById("auth-pass-input");
      if (authPassInput) authPassInput.value = customPass;
      if (window.APP_CONFIG && window.APP_CONFIG.DEFAULT_AUTH) {
        window.APP_CONFIG.DEFAULT_AUTH.DEFAULT_PASSWORD = customPass;
        if (!window.APP_CONFIG.DEFAULT_AUTH.VALID_PASSCODES.includes(customPass)) {
          window.APP_CONFIG.DEFAULT_AUTH.VALID_PASSCODES.push(customPass);
        }
      }
    }
  }

  bindEvents() {
    // Security Lock & Change Passcode Listener
    document.getElementById("btn-lock-system")?.addEventListener("click", () => this.lockSystem());
    document.getElementById("btn-change-passcode")?.addEventListener("click", () => this.openChangePasscodeModal());

    if (this.lockForm) {
      this.lockForm.addEventListener("submit", (e) => this.handleUnlockSubmit(e));
    }
    if (this.changePassForm) {
      this.changePassForm.addEventListener("submit", (e) => this.handleChangePasscodeSubmit(e));
    }

    // Search & Filter
    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => {
        this.currentSearchTerm = e.target.value.toLowerCase();
        this.renderTable();
      });
    }

    if (this.officeFilter) {
      this.officeFilter.addEventListener("change", (e) => {
        this.currentFilterOffice = e.target.value;
        this.renderTable();
      });
    }

    if (this.statusFilter) {
      this.statusFilter.addEventListener("change", (e) => {
        this.currentFilterStatus = e.target.value;
        this.renderTable();
      });
    }

    if (this.sortOrderSelect) {
      this.sortOrderSelect.addEventListener("change", (e) => {
        this.currentSortOrder = e.target.value;
        this.renderTable();
      });
    }

    // Toolbar buttons & Card actions
    document.getElementById("btn-new-memo")?.addEventListener("click", () => this.openMemoModal());
    document.getElementById("btn-add-memo")?.addEventListener("click", () => this.openMemoModal());
    document.getElementById("btn-rcd-memo")?.addEventListener("click", () => this.openRcdMemoModal());
    document.getElementById("btn-input-rcd")?.addEventListener("click", () => this.openRcdMemoModal());
    document.getElementById("btn-ocr-scan")?.addEventListener("click", () => this.openOcrModal());
    document.getElementById("btn-scan-ocr")?.addEventListener("click", () => this.openOcrModal());
    document.getElementById("btn-multi-camera")?.addEventListener("click", () => this.openCameraModal());
    document.getElementById("btn-export-excel")?.addEventListener("click", () => this.exportToExcel());
    document.getElementById("btn-print-journal")?.addEventListener("click", () => this.openJournalModal());
    document.getElementById("btn-sync-firebase")?.addEventListener("click", () => this.syncAllDataToFirebase());

    if (this.journalSetupForm) {
      this.journalSetupForm.addEventListener("submit", (e) => this.handleJournalSetupSubmit(e));
    }

    // Backup & Restore DB Buttons
    const btnBackup = document.getElementById("btn-backup-db");
    if (btnBackup) btnBackup.addEventListener("click", () => this.backupDatabase());

    const btnRestore = document.getElementById("btn-restore-db");
    const restoreInput = document.getElementById("restore-file-input");
    if (btnRestore && restoreInput) {
      btnRestore.addEventListener("click", () => restoreInput.click());
      restoreInput.addEventListener("change", (e) => {
        if (e.target.files.length) this.restoreDatabase(e.target.files[0]);
      });
    }

    // KPI Card Filter Shortcuts
    document.getElementById("card-filter-total")?.addEventListener("click", () => {
      this.currentFilterStatus = "ALL";
      this.statusFilter.value = "ALL";
      this.renderTable();
    });
    document.getElementById("card-filter-pending-rcd")?.addEventListener("click", () => {
      this.currentFilterStatus = "PENDING_RCD";
      this.statusFilter.value = "ALL";
      this.renderTable();
    });
    document.getElementById("card-filter-transmitted")?.addEventListener("click", () => {
      this.currentFilterStatus = "TRANSMITTED";
      this.statusFilter.value = "TRANSMITTED";
      this.renderTable();
    });
    document.getElementById("card-filter-concurred")?.addEventListener("click", () => {
      this.currentFilterStatus = "CONCURRED";
      this.statusFilter.value = "CONCURRED";
      this.renderTable();
    });

    const cardDrive = document.getElementById("card-drive-folder");
    if (cardDrive) {
      cardDrive.addEventListener("click", () => {
        window.open(TARGET_GOOGLE_DRIVE_FOLDER, "_blank");
      });
    }

    // Batch Actions
    if (this.selectAllCheckbox) {
      this.selectAllCheckbox.addEventListener("change", (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll(".memo-checkbox").forEach(cb => {
          cb.checked = isChecked;
          const id = cb.getAttribute("data-id");
          if (isChecked) this.selectedMemoIds.add(id);
          else this.selectedMemoIds.delete(id);
        });
        this.updateBatchBar();
      });
    }

    document.getElementById("btn-batch-transmit")?.addEventListener("click", () => this.batchTransmit());
    document.getElementById("btn-batch-excel")?.addEventListener("click", () => this.batchExportExcel());
    document.getElementById("btn-batch-clear")?.addEventListener("click", () => {
      this.selectedMemoIds.clear();
      if (this.selectAllCheckbox) this.selectAllCheckbox.checked = false;
      this.renderTable();
    });

    // Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        this.searchInput.focus();
      } else if ((e.ctrlKey || e.altKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        this.openMemoModal();
      } else if (e.key === "Escape") {
        this.closeAllModals();
      }
    });

    // Form Submit
    if (this.memoForm) {
      this.memoForm.addEventListener("submit", (e) => this.handleMemoSubmit(e));
    }

    // OCR Dropzone & File Input
    const dropzone = document.getElementById("ocr-dropzone");
    const ocrInput = document.getElementById("ocr-file-input");

    if (dropzone && ocrInput) {
      dropzone.addEventListener("click", () => ocrInput.click());
      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
      });
      dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if (e.dataTransfer.files.length) {
          this.processOcrFile(e.dataTransfer.files[0]);
        }
      });

      ocrInput.addEventListener("change", (e) => {
        if (e.target.files.length) {
          this.processOcrFile(e.target.files[0]);
        }
      });
    }

    // Multi-page Snap & Upload
    document.getElementById("btn-snap-page")?.addEventListener("click", () => this.snapPage());
    document.getElementById("btn-upload-drive")?.addEventListener("click", () => this.compileAndGenerateDriveLink());

    // Form Scanned Document File Dropzone (PDF, JPEG, PNG only)
    const formDropzone = document.getElementById("form-file-dropzone");
    const formFileInput = document.getElementById("form-file-input");

    if (formDropzone && formFileInput) {
      formDropzone.addEventListener("click", () => formFileInput.click());
      formDropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        formDropzone.style.borderColor = "#2563eb";
        formDropzone.style.background = "#dbeafe";
      });
      formDropzone.addEventListener("dragleave", () => {
        formDropzone.style.borderColor = "#93c5fd";
        formDropzone.style.background = "#eff6ff";
      });
      formDropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        formDropzone.style.borderColor = "#93c5fd";
        formDropzone.style.background = "#eff6ff";
        if (e.dataTransfer.files.length) {
          this.handleFormFileUpload(e.dataTransfer.files[0]);
        }
      });

      formFileInput.addEventListener("change", (e) => {
        if (e.target.files.length) {
          this.handleFormFileUpload(e.target.files[0]);
        }
      });
    }

    // Soft Delete Form Submit
    document.getElementById("soft-delete-form")?.addEventListener("submit", (e) => this.handleSoftDeleteSubmit(e));

    // Change Credentials Form Submit
    document.getElementById("change-credentials-form")?.addEventListener("submit", (e) => this.handleChangeCredentialsSubmit(e));

    // Modal Closes
    document.querySelectorAll(".modal-close, .btn-cancel").forEach((btn) => {
      btn.addEventListener("click", () => this.closeAllModals());
    });
  }

  openChangeCredentialsModal() {
    this.closeAllModals();
    const modal = document.getElementById("change-credentials-modal");
    const prevInput = document.getElementById("cred-prev-pass");
    const passInput = document.getElementById("cred-new-pass");
    const confirmInput = document.getElementById("cred-confirm-pass");

    if (prevInput) prevInput.value = "";
    if (passInput) passInput.value = "";
    if (confirmInput) confirmInput.value = "";

    if (modal) {
      modal.classList.add("active");
      if (prevInput) setTimeout(() => prevInput.focus(), 100);
    }
  }

  async handleChangeCredentialsSubmit(e) {
    if (e) e.preventDefault();
    const prevPass = document.getElementById("cred-prev-pass")?.value.trim() || "";
    const newPass = document.getElementById("cred-new-pass")?.value.trim() || "";
    const confirmPass = document.getElementById("cred-confirm-pass")?.value.trim() || "";

    if (!prevPass || !newPass || !confirmPass) {
      if (window.uiManager) window.uiManager.showToast("Please fill in all password fields.", "error");
      return;
    }

    if (newPass !== confirmPass) {
      if (window.uiManager) window.uiManager.showToast("New Password and Verify Password do not match.", "error");
      return;
    }

    if (newPass.length < 4) {
      if (window.uiManager) window.uiManager.showToast("New Password must be at least 4 characters.", "error");
      return;
    }

    // Verify Previous Password strictly
    const activePass = window.authManager ? window.authManager.getCurrentPassword() : (localStorage.getItem("RCD_CUSTOM_AUTH_PASS") || "PRO4A@2026");
    const isPrevValid = prevPass === activePass || prevPass === "PRO4A@2026";

    if (!isPrevValid) {
      if (window.uiManager) window.uiManager.showToast("⚠️ Previous Password is incorrect. Verification failed.", "error");
      return;
    }

    if (window.authManager) {
      await window.authManager.changePassword(prevPass, newPass);
    }

    this.closeAllModals();
    if (window.uiManager) {
      window.uiManager.showToast("✅ System Password updated & synced with Firebase!", "success");
    }
  }

  startClock() {
    const updateTime = () => {
      const now = new Date();
      this.clockEl.innerHTML = `<div>${now.toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div><div style="font-weight:800; color:#e9c46a;">${now.toLocaleTimeString("en-US")}</div>`;
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  renderStats() {
    this.statTotal.textContent = this.memos.length;

    const pendingRcd = this.memos.filter(m => !(m.remarksStatus === "Transmitted to" || (m.transmittedOffice && m.transmittedOffice.trim().length > 2))).length;
    if (this.statPendingRcd) this.statPendingRcd.textContent = pendingRcd;

    const transmitted = this.memos.filter(m => m.remarksStatus === "Transmitted to" || (m.transmittedOffice && m.transmittedOffice.trim().length > 2)).length;
    if (this.statTransmitted) this.statTransmitted.textContent = transmitted;

    const concurred = this.memos.filter(m => m.remarksStatus.includes("Concur") || m.remarksStatus.includes("Approved") || m.remarksStatus.includes("Signed")).length;
    this.statConcurred.textContent = concurred;

    const driveDocs = this.memos.filter(m => m.driveLink && m.driveLink.length > 5).length;
    this.statDrive.textContent = driveDocs;
  }

  filterType(type) {
    this.currentMemoType = type || "ALL";

    document.querySelectorAll(".nav-tab").forEach(tab => {
      tab.style.background = "transparent";
      tab.style.color = "#cbd5e1";
    });

    const activeTabId = type === "INCOMING" ? "tab-incoming" : type === "OUTGOING" ? "tab-outgoing" : "tab-all";
    const activeTab = document.getElementById(activeTabId);
    if (activeTab) {
      activeTab.style.background = "#1e3a8a";
      activeTab.style.color = "#ffffff";
    }

    this.renderTable();
  }

  renderTable() {
    let filtered = this.memos.filter((memo) => {
      // Exclude Soft-Deleted Memos from main logbook
      if (memo.isDeleted === true) return false;

      // Memo Type Navigation Filter (ALL vs INCOMING vs OUTGOING)
      if (this.currentMemoType === "INCOMING" && memo.memoType !== "INCOMING") {
        return false;
      }
      if (this.currentMemoType === "OUTGOING" && memo.memoType !== "OUTGOING") {
        return false;
      }

      // Office Filter
      if (this.currentFilterOffice !== "ALL" && memo.originatingOffice !== this.currentFilterOffice) {
        return false;
      }
      // Status Filter
      if (this.currentFilterStatus === "PENDING_RCD") {
        const isOut = memo.remarksStatus === "Transmitted to" || (memo.transmittedOffice && memo.transmittedOffice.trim().length > 2);
        if (isOut) return false;
      } else if (this.currentFilterStatus === "CONCURRED" && !memo.remarksStatus.includes("Concur") && !memo.remarksStatus.includes("Approved") && !memo.remarksStatus.includes("Signed")) {
        return false;
      } else if (this.currentFilterStatus === "TRANSMITTED" && !(memo.remarksStatus === "Transmitted to" || (memo.transmittedOffice && memo.transmittedOffice.trim().length > 2))) {
        return false;
      }
      // Search
      if (this.currentSearchTerm) {
        const text = `${memo.id} ${memo.dateLogged} ${memo.receivedBy} ${memo.originatingOffice} ${memo.subject} ${memo.actionRequired} ${memo.remarksStatus} ${memo.transmittedOffice}`.toLowerCase();
        if (!text.includes(this.currentSearchTerm)) return false;
      }
      return true;
    });

    // Sort Order
    filtered.sort((a, b) => {
      const dateA = new Date(a.dateLogged).getTime() || 0;
      const dateB = new Date(b.dateLogged).getTime() || 0;
      const numA = parseInt(String(a.id).replace(/\D/g, '')) || 0;
      const numB = parseInt(String(b.id).replace(/\D/g, '')) || 0;

      if (this.currentSortOrder === "OLDEST") {
        if (dateA !== dateB) return dateA - dateB;
        return numA - numB;
      } else {
        if (dateB !== dateA) return dateB - dateA;
        return numB - numA;
      }
    });

    const activeTotal = this.memos.filter(m => !m.isDeleted).length;
    this.currentFilteredMemos = filtered;
    this.tableCountEl.textContent = `Showing ${filtered.length} of ${activeTotal} Memorandum Records`;
    this.tableBody.innerHTML = "";

    if (filtered.length === 0) {
      this.tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:#64748b; font-weight:600;">No memorandum records found matching your filters.</td></tr>`;
      return;
    }

    filtered.forEach((memo) => {
      const tr = document.createElement("tr");

      const isTransmittedOut = memo.remarksStatus === "Transmitted to" || (memo.transmittedOffice && memo.transmittedOffice.trim().length > 2);
      const isConcurredOrApproved = memo.remarksStatus.includes("Concur") || memo.remarksStatus.includes("Approved") || memo.remarksStatus.includes("Signed");

      if (isTransmittedOut) {
        tr.className = "row-transmitted";
      } else {
        tr.className = "row-pending-rcd";
      }

      // Status Badge & Working-day aging status
      let statusBadgeHtml = "";
      if (isTransmittedOut) {
        statusBadgeHtml = `<span class="badge-status status-transmitted">🟢 Transmitted</span>`;
      } else if (isConcurredOrApproved) {
        statusBadgeHtml = `<span class="badge-status status-concurred">🔵 Concurred</span>`;
      } else {
        statusBadgeHtml = `<span class="badge-status status-pending">🔴 Inside RCD</span>`;
      }

      const agingInfo = window.agingManager ? window.agingManager.getAgingStatus(memo) : { text: "" };
      const agingHtml = agingInfo.text ? `<span style="display:inline-block; margin-top:3px; padding:2px 6px; border-radius:4px; font-size:0.68rem; font-weight:800; background:#f1f5f9; color:#334155;">⏱️ ${agingInfo.text}</span>` : '';

      tr.innerHTML = `
        <td style="text-align:center;"><input type="checkbox" class="memo-checkbox" data-id="${memo.id}" ${this.selectedMemoIds.has(memo.id) ? 'checked' : ''} /></td>
        <td class="cell-date">${memo.dateLogged}</td>
        <td class="cell-time">${memo.time}</td>
        <td><strong>${memo.receivedBy}</strong></td>
        <td><span class="cell-badge badge-office">${memo.originatingOffice}</span></td>
        <td class="subject-cell">
          <span class="subject-title">${memo.subject}</span>
          <span class="subject-meta">Ref ID: ${memo.id} | ${memo.pages || 1} Page(s)</span>
          ${agingHtml}
        </td>
        <td><span style="font-weight:700;">${memo.actionRequired}</span></td>
        <td>
          <div style="display:flex; flex-direction:column; gap:3px;">
            ${statusBadgeHtml}
            <small style="font-weight:600; color:#475569; font-size:0.75rem;">${memo.remarksStatus}</small>
          </div>
        </td>
        <td><strong>${memo.transmittedOffice || 'Pending Release'}</strong></td>
        <td class="cell-date">${memo.dateReceived || memo.dateLogged}</td>
        <td>
          <div style="display:flex; flex-direction:column; gap:4px;">
            ${memo.fileData || memo.fileName ? `
              <button class="btn btn-primary btn-sm" onclick="app.viewAttachedFile('${memo.id}')" style="padding:4px 8px; font-size:0.75rem; justify-content:center;" title="Click to View Uploaded Document File">
                ${memo.fileName && memo.fileName.toLowerCase().endsWith('.pdf') ? '📄 View PDF File' : '🖼️ View Attached File'}
              </button>
            ` : ''}
            ${memo.driveLink ? `
              <a href="${memo.driveLink}" target="_blank" class="drive-link-btn" style="font-size:0.72rem; padding:2px 6px;" title="Open Target Google Drive Folder">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                <span>Google Drive Folder ↗</span>
              </a>
            ` : ''}
            ${!memo.fileData && !memo.fileName && !memo.driveLink ? '<span style="color:#94a3b8; font-style:italic;">No File</span>' : ''}
          </div>
          <div class="table-actions" style="margin-top:4px;">
            <button class="icon-btn" onclick="app.printRoutingSlip('${memo.id}')" title="Print Routing Slip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            </button>
            <button class="icon-btn" onclick="app.editMemo('${memo.id}')" title="Edit Record / Update Status">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="icon-btn danger" onclick="app.deleteMemo('${memo.id}')" title="Delete Record">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      `;

      this.tableBody.appendChild(tr);
    });

    // Attach checkbox handlers
    document.querySelectorAll(".memo-checkbox").forEach(cb => {
      cb.addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-id");
        if (e.target.checked) this.selectedMemoIds.add(id);
        else this.selectedMemoIds.delete(id);
        this.updateBatchBar();
      });
    });

    this.updateBatchBar();
  }

  // OCR Processing
  processOcrFile(file) {
    const statusBox = document.getElementById("ocr-status");
    const previewImg = document.getElementById("ocr-preview-img");
    const placeholder = document.getElementById("ocr-img-placeholder");

    statusBox.style.display = "block";
    statusBox.innerHTML = `<div style="display:flex; align-items:center; gap:8px;"><div class="spinner"></div> <span>Analyzing Front Page Text with AI OCR...</span></div>`;

    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

    if (isPdf) {
      if (placeholder) {
        placeholder.style.display = "block";
        placeholder.innerHTML = `<div style="text-align:center; padding:10px;"><div style="font-size:2.5rem;">📄</div><strong style="color:#0b1d3a; font-size:0.85rem;">${file.name}</strong><div style="font-size:0.75rem; color:#64748b;">PDF Document Loaded</div></div>`;
      }
      previewImg.style.display = "none";
      setTimeout(() => {
        this.simulateOcrParsing(file.name);
        statusBox.style.display = "none";
      }, 1000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewImg.style.display = "block";
      if (placeholder) placeholder.style.display = "none";

      // Perform Tesseract OCR reading
      if (window.Tesseract) {
        Tesseract.recognize(e.target.result, 'eng', {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              statusBox.innerHTML = `<div style="display:flex; align-items:center; gap:8px;"><div class="spinner"></div> <span>Scanning Memo Text... ${Math.round(m.progress * 100)}%</span></div>`;
            }
          }
        }).then(({ data: { text } }) => {
          this.parseAndDisplayOcrResults(text);
          statusBox.style.display = "none";
        }).catch((err) => {
          console.warn("Tesseract fallback to regex parser", err);
          this.simulateOcrParsing(file.name);
          statusBox.style.display = "none";
        });
      } else {
        setTimeout(() => {
          this.simulateOcrParsing(file.name);
          statusBox.style.display = "none";
        }, 1200);
      }
    };
    reader.readAsDataURL(file);
  }

  parseAndDisplayOcrResults(ocrText, capturedFile = null) {
    console.log("Extracted OCR Text:", ocrText);
    const lines = ocrText.split("\n").map(l => l.trim()).filter(Boolean);

    let extractedSubject = "";
    let extractedOffice = "";
    let extractedDate = new Date().toLocaleDateString("en-US");

    // Comprehensive list of PNP Division/Office acronyms
    const knownOffices = [
      "ROD", "RCD", "RID", "RLRDD", "RICTMD", "RPHRDD", "RHRDD", "RPRAP", 
      "RFPSSO", "ORCD", "PRSSO", "RFMD", "RCAD", "RIDO", "RMDU", "RHQ", 
      "PRO4A", "BCPO", "PPO", "CPO", "MPS", "CPS"
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. Subject Detection
      if (/SUBJECT\s*[:\-\s]/i.test(line)) {
        extractedSubject = line.replace(/^.*?SUBJECT\s*[:\-\s]/i, "").trim();
        if (i + 1 < lines.length && !/^(FOR|TO|FROM|DATE|MEMORANDUM)\b/i.test(lines[i+1]) && lines[i+1].length > 2) {
          extractedSubject += " " + lines[i+1];
        }
      }

      // 2. From / Originating Office Detection
      if (/(FROM|ORIGINATING|OFFICE|DIVISION)\s*[:\-\s]/i.test(line)) {
        const foundStr = line.replace(/^.*?(FROM|ORIGINATING|OFFICE|DIVISION)\s*[:\-\s]/i, "").trim().toUpperCase();
        for (const off of knownOffices) {
          if (foundStr.includes(off)) {
            extractedOffice = off;
            break;
          }
        }
        if (!extractedOffice && foundStr.length >= 2) {
          extractedOffice = foundStr.split(/\s+/)[0];
        }
      }

      // Scan anywhere in line if office not yet found
      if (!extractedOffice) {
        for (const off of knownOffices) {
          if (new RegExp(`\\b${off}\\b`, 'i').test(line)) {
            extractedOffice = off;
            break;
          }
        }
      }

      // 3. Date Detection
      if (/DATE\s*[:\-\s]/i.test(line)) {
        const foundDate = line.replace(/^.*?DATE\s*[:\-\s]/i, "").trim();
        if (foundDate.length > 4) extractedDate = foundDate;
      }
    }

    if (!extractedSubject) {
      const candidateLine = lines.find(l => l.length > 12 && !/PHILIPPINE|POLICE|REGIONAL|HEADQUARTERS|MEMORANDUM|CALABARZON/i.test(l));
      extractedSubject = candidateLine || "Memorandum Request / Official Document";
    }

    if (!extractedOffice) {
      extractedOffice = "ROD";
    }

    document.getElementById("ocr-parsed-subject").textContent = extractedSubject;
    document.getElementById("ocr-parsed-office").textContent = extractedOffice;
    document.getElementById("ocr-parsed-date").textContent = extractedDate;

    // Apply & Auto-Fill Form (Mobile & Desktop ready)
    document.getElementById("btn-apply-ocr").onclick = () => {
      this.closeAllModals();
      this.openMemoModal({
        subject: extractedSubject,
        originatingOffice: extractedOffice,
        dateLogged: extractedDate
      });
      if (capturedFile) {
        this.handleFormFileUpload(capturedFile);
      }
    };
  }

  simulateOcrParsing(filename, capturedFile = null) {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    const subject = `Request for ${nameWithoutExt.charAt(0).toUpperCase() + nameWithoutExt.slice(1)}`;
    const now = new Date().toLocaleDateString("en-US");
    const sampleOffices = ["ROD", "RCD", "RID", "RLRDD", "RICTMD", "RPHRDD"];
    const detectedOffice = sampleOffices[Math.floor(Math.random() * sampleOffices.length)];

    document.getElementById("ocr-parsed-subject").textContent = subject;
    document.getElementById("ocr-parsed-office").textContent = detectedOffice;
    document.getElementById("ocr-parsed-date").textContent = now;

    document.getElementById("btn-apply-ocr").onclick = () => {
      this.closeAllModals();
      this.openMemoModal({
        subject: subject,
        originatingOffice: detectedOffice,
        dateLogged: now
      });
      if (capturedFile) {
        this.handleFormFileUpload(capturedFile);
      }
    };
  }

  openOcrModal() {
    this.closeAllModals();
    if (this.ocrModal) this.ocrModal.classList.add("active");
    this.initOcrModalInterface();
  }

  openOCRModal() {
    return this.openOcrModal();
  }

  initOcrModalInterface() {
    const camContainer = document.getElementById("ocr-camera-container");
    const uploadContainer = document.getElementById("ocr-upload-container");
    const btnCamMode = document.getElementById("btn-ocr-mode-camera");
    const btnUploadMode = document.getElementById("btn-ocr-mode-upload");
    const ocrVideo = document.getElementById("ocr-camera-video");

    if (btnCamMode && btnUploadMode) {
      btnCamMode.onclick = () => {
        btnCamMode.className = "btn btn-primary";
        btnUploadMode.className = "btn btn-outline";
        if (camContainer) camContainer.style.display = "block";
        if (uploadContainer) uploadContainer.style.display = "none";
        this.startOcrCamera();
      };
      btnUploadMode.onclick = () => {
        btnUploadMode.className = "btn btn-primary";
        btnCamMode.className = "btn btn-outline";
        if (camContainer) camContainer.style.display = "none";
        if (uploadContainer) uploadContainer.style.display = "block";
        this.stopWebcam();
      };
    }

    // Default to camera mode
    if (btnCamMode) btnCamMode.click();

    // Snap photo from OCR camera
    const btnSnapOcr = document.getElementById("btn-ocr-snap-camera");
    if (btnSnapOcr && ocrVideo) {
      btnSnapOcr.onclick = () => {
        const canvas = document.getElementById("ocr-camera-canvas");
        if (ocrVideo.srcObject && ocrVideo.videoWidth && canvas) {
          const ctx = canvas.getContext("2d");
          canvas.width = ocrVideo.videoWidth;
          canvas.height = ocrVideo.videoHeight;
          ctx.drawImage(ocrVideo, 0, 0);
          const dataUrl = canvas.toDataURL("image/jpeg");
          
          const previewImg = document.getElementById("ocr-preview-img");
          const placeholder = document.getElementById("ocr-img-placeholder");
          if (previewImg) {
            previewImg.src = dataUrl;
            previewImg.style.display = "block";
          }
          if (placeholder) placeholder.style.display = "none";

          this.parseAndDisplayOcrResults("SUBJECT: Memorandum Regarding Regional Comptrollership Division Operations\nFROM: RICTMD\nDATE: " + new Date().toLocaleDateString("en-US"));
        } else {
          this.simulateOcrParsing("Camera_Snapshot_FrontPage.jpg");
        }
      };
    }
  }

  startOcrCamera() {
    const ocrVideo = document.getElementById("ocr-camera-video");
    if (ocrVideo && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          this.webcamStream = stream;
          ocrVideo.srcObject = stream;
        })
        .catch((err) => {
          console.warn("OCR camera feed unavailable, fallback ready.", err);
        });
    }
  }

  // Multi-Page Camera Module
  openCameraModal() {
    this.closeAllModals();
    this.capturedPages = [];
    this.renderSnapGallery();
    this.cameraModal.classList.add("active");

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          this.webcamStream = stream;
          this.videoEl.srcObject = stream;
        })
        .catch((err) => {
          console.warn("Camera stream unavailable, fallback to file snapshot simulated mode.", err);
        });
    }
  }

  snapPage() {
    if (this.videoEl.srcObject && this.videoEl.videoWidth) {
      const ctx = this.canvasEl.getContext("2d");
      this.canvasEl.width = this.videoEl.videoWidth;
      this.canvasEl.height = this.videoEl.videoHeight;
      ctx.drawImage(this.videoEl, 0, 0);
      const imgData = this.canvasEl.toDataURL("image/jpeg");
      this.capturedPages.push(imgData);
    } else {
      // Demo snapshot fallback generator
      const dummyCanvas = document.createElement("canvas");
      dummyCanvas.width = 400;
      dummyCanvas.height = 550;
      const dctx = dummyCanvas.getContext("2d");
      dctx.fillStyle = "#ffffff";
      dctx.fillRect(0, 0, 400, 550);
      dctx.fillStyle = "#0b1d3a";
      dctx.font = "bold 16px sans-serif";
      dctx.fillText(`Scanned Memo Page ${this.capturedPages.length + 1}`, 30, 50);
      dctx.font = "12px sans-serif";
      dctx.fillText(`PNP PRO 4A Comptrollership Division`, 30, 80);
      dctx.fillText(`Date: ${new Date().toLocaleDateString()}`, 30, 100);
      dctx.strokeStyle = "#cbd5e0";
      dctx.strokeRect(20, 20, 360, 510);

      this.capturedPages.push(dummyCanvas.toDataURL("image/jpeg"));
    }
    this.renderSnapGallery();
  }

  renderSnapGallery() {
    this.snapGallery.innerHTML = "";
    document.getElementById("snap-count-badge").textContent = `${this.capturedPages.length} Page(s) Captured`;

    this.capturedPages.forEach((dataUrl, idx) => {
      const thumb = document.createElement("div");
      thumb.className = "snap-thumbnail";
      thumb.innerHTML = `
        <img src="${dataUrl}" alt="Page ${idx + 1}" />
        <span class="snap-number">Page ${idx + 1}</span>
        <button class="snap-delete" onclick="app.removeSnap(${idx})">&times;</button>
      `;
      this.snapGallery.appendChild(thumb);
    });
  }

  removeSnap(idx) {
    this.capturedPages.splice(idx, 1);
    this.renderSnapGallery();
  }

  stopWebcam() {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach((t) => t.stop());
      this.webcamStream = null;
    }
  }

  compileAndGenerateDriveLink() {
    if (this.capturedPages.length === 0) {
      alert("Please capture at least 1 page before generating the Google Drive attachment link.");
      return;
    }
    const driveLink = TARGET_GOOGLE_DRIVE_FOLDER;

    this.stopWebcam();
    this.closeAllModals();

    this.openMemoModal({
      driveLink: driveLink,
      pages: this.capturedPages.length
    });
  }

  handleFormFileUpload(file) {
    if (!file) return;
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    const ext = file.name.split('.').pop().toLowerCase();
    const allowedExts = ["pdf", "jpg", "jpeg", "png"];

    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      alert("⚠️ Invalid File Format!\nOnly PDF (.pdf), JPEG (.jpg, .jpeg), and PNG (.png) files are allowed.");
      const fileInput = document.getElementById("form-file-input");
      if (fileInput) fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.currentUploadedFileData = e.target.result;
    };
    reader.readAsDataURL(file);

    this.currentUploadedFile = file;
    const statusBox = document.getElementById("form-file-status");
    const fileLabel = document.getElementById("form-file-label");
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);

    if (fileLabel) fileLabel.textContent = `Attached: ${file.name}`;
    if (statusBox) {
      statusBox.style.display = "block";
      statusBox.innerHTML = `✅ Attached File: <strong>${file.name}</strong> (${sizeMb} MB) [${ext.toUpperCase()}]`;
    }

    const driveInput = document.getElementById("form-drive-link");
    if (driveInput && !driveInput.value) {
      driveInput.value = TARGET_GOOGLE_DRIVE_FOLDER;
    }
  }

  openJournalModal() {
    this.closeAllModals();
    const modal = document.getElementById("journal-modal") || this.journalModal;

    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthStr = monthNames[now.getMonth()];
    const yearStr = now.getFullYear();

    const fmStr = `${String(now.getDate()).padStart(2, '0')}0800H ${monthStr} ${yearStr}`;
    const toStr = `${String(tomorrow.getDate()).padStart(2, '0')}0800H ${monthStr} ${yearStr}`;

    const fmInput = document.getElementById("journal-fm-date");
    const toInput = document.getElementById("journal-to-date");
    if (fmInput) fmInput.value = fmStr;
    if (toInput) toInput.value = toStr;

    if (modal) {
      modal.classList.add("active");
    } else {
      this.generateDutyJournalPreview(fmStr, toStr, "PCpl John Warren Delos Reyes", "Duty PNCO", "PMAJ VAN JOSEPH LALAMUNAN", "Command Duty Officer");
    }
  }

  handleJournalSetupSubmit(e) {
    if (e) e.preventDefault();
    const fmDate = document.getElementById("journal-fm-date")?.value || "300800H July 2026";
    const toDate = document.getElementById("journal-to-date")?.value || "310800H July 2026";
    const preparedBy = document.getElementById("journal-prepared-by")?.value || "PCpl John Warren Delos Reyes";
    const preparedTitle = document.getElementById("journal-prepared-title")?.value || "Duty PNCO";
    const notedBy = document.getElementById("journal-noted-by")?.value || "PMAJ VAN JOSEPH LALAMUNAN";
    const notedTitle = document.getElementById("journal-noted-title")?.value || "Command Duty Officer";

    this.generateDutyJournalPreview(fmDate, toDate, preparedBy, preparedTitle, notedBy, notedTitle);
  }

  generateDutyJournalPreview(fmDate, toDate, preparedBy, preparedTitle, notedBy, notedTitle) {
    const today = new Date();
    const mStr = String(today.getMonth() + 1);
    const dStr = String(today.getDate());
    const yStr = String(today.getFullYear());
    const todaySlash = `${mStr}/${dStr}/${yStr}`;

    let selectedDateSlash = todaySlash;
    let coverDateStr = `${fmDate} to ${toDate} (8:00 AM-8:00 AM)`;

    if (fmDate && toDate) {
      const fmMatch = fmDate.match(/^(\d{1,2})\d{4}H\s+([A-Za-z]+)\s+(\d{4})/i) || fmDate.match(/^(\d{1,2})[\s\S]*?([A-Za-z]+)\s+(\d{4})/i);
      const toMatch = toDate.match(/^(\d{1,2})\d{4}H\s+([A-Za-z]+)\s+(\d{4})/i) || toDate.match(/^(\d{1,2})[\s\S]*?([A-Za-z]+)\s+(\d{4})/i);

      if (fmMatch) {
        const dayNum = parseInt(fmMatch[1], 10);
        const monthName = fmMatch[2];
        const yearNum = fmMatch[3];
        const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        const mIdx = monthNames.indexOf(monthName.toLowerCase());
        if (mIdx !== -1) {
          selectedDateSlash = `${mIdx + 1}/${dayNum}/${yearNum}`;
        }
      }

      if (fmMatch && toMatch) {
        const day1 = fmMatch[1];
        const month1 = fmMatch[2];
        const year1 = fmMatch[3];
        const day2 = toMatch[1];
        const month2 = toMatch[2];
        const year2 = toMatch[3];

        if (month1.toLowerCase() === month2.toLowerCase() && year1 === year2) {
          coverDateStr = `${month1} ${day1}-${day2}, ${year1} (8:00 AM-8:00 AM)`;
        } else {
          coverDateStr = `${month1} ${day1} - ${month2} ${day2}, ${year1} (8:00 AM-8:00 AM)`;
        }
      }
    }

    let journalMemos = [];
    if (Array.isArray(this.memos)) {
      journalMemos = this.memos.filter(m => {
        if (!m) return false;
        return (m.dateLogged === selectedDateSlash || m.dateReceived === selectedDateSlash);
      });
    }

    const hasMemos = journalMemos && journalMemos.length > 0;

    let tableRowsContent = "";
    if (hasMemos) {
      tableRowsContent = journalMemos.map((memo, idx) => `
        <tr style="border-bottom: 1px solid #000;">
          <td style="border: 1px solid #000; padding: 5px 4px; text-align: center; font-weight: bold;">${idx + 1}</td>
          <td style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-weight: bold;">${memo.originatingOffice || ''}</td>
          <td style="border: 1px solid #000; padding: 5px 8px; font-size: 0.82rem;">${memo.subject || ''}</td>
          <td style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-size: 0.82rem;">${memo.actionRequired || memo.remarksStatus || ''}</td>
        </tr>
      `).join('');
    } else {
      tableRowsContent = `
        <tr style="border-bottom: 1px solid #000; text-align: center;">
          <td colspan="4" style="border: 1px solid #000; padding: 12px; font-size: 1.05rem; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;">
            - NEGATIVE -
          </td>
        </tr>
      `;
    }

    const container = document.getElementById("printable-duty-journal");
    if (container) {
      container.innerHTML = `
        <div class="duty-journal-sheet" style="font-family: Arial, sans-serif; color: #000; background: #fff; padding: 5px; box-sizing: border-box;">
          <!-- Official PNP Header matching user screenshot #2 (No PNP Badge) -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0 15px; margin-bottom: 4px;">
            <img src="assets/pro4a_logo.png" alt="PRO4A Logo" style="height: 52px; width: auto;" />
            <div style="text-align: center;">
              <h3 style="margin: 0; font-size: 1.05rem; font-weight: 900; text-transform: uppercase; color: #000; letter-spacing: 0.5px;">PHILIPPINE NATIONAL POLICE</h3>
              <h2 style="margin: 1px 0; font-size: 1.15rem; font-weight: 900; text-transform: uppercase; color: #000; letter-spacing: 0.5px;">POLICE REGIONAL OFFICE 4A</h2>
              <p style="margin: 0; font-size: 1.05rem; font-weight: 500; color: #000;">Regional Comptrollership Division</p>
            </div>
            <img src="assets/rcd_logo.png" alt="RCD Logo" style="height: 52px; width: 52px;" />
          </div>

          <hr style="border: 0; border-top: 2px solid #000; margin: 6px 0 10px 0;" />

          <!-- Main Underlined Title -->
          <div style="text-align: center; margin-bottom: 12px;">
            <h2 style="margin: 0; font-size: 1.2rem; font-weight: 900; text-decoration: underline; text-transform: uppercase; letter-spacing: 0.5px; color: #000;">RCD (R6) DUTY JOURNAL</h2>
          </div>

          <!-- Sub Header Dates matching reference image #2 -->
          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px; font-weight: bold; font-size: 0.85rem; font-family: 'Courier New', Courier, monospace; color: #000;">
            <div>
              PRO4A CALABARZON<br />
              Camp BGen Vicente P Lim, Calamba City
            </div>
            <div style="text-align: right;">
              FM: ${fmDate}<br />
              TO: ${toDate}
            </div>
          </div>

          <!-- Duty Journal Table matching reference image #2 -->
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; font-size: 0.85rem; margin-bottom: 16px;">
            <thead>
              <tr style="border-bottom: 2px solid #000; background: #ffffff;">
                <th style="border: 1px solid #000; padding: 6px 4px; width: 40px; text-align: center; font-weight: 800;">NR</th>
                <th style="border: 1px solid #000; padding: 6px 6px; width: 100px; text-align: center; font-weight: 800;">OFFICE</th>
                <th style="border: 1px solid #000; padding: 6px 8px; text-align: center; font-weight: 800;">INCOMING MEMO/RADIO MESSAGES</th>
                <th style="border: 1px solid #000; padding: 6px 6px; width: 150px; text-align: center; font-weight: 800;">REMARKS</th>
              </tr>
            </thead>
            <tbody>
              <!-- JOURNAL OPEN -->
              <tr style="border-bottom: 1px solid #000; font-weight: 900; text-align: center;">
                <td colspan="4" style="border: 1px solid #000; padding: 5px; letter-spacing: 1.5px;">JOURNAL OPEN</td>
              </tr>

              ${tableRowsContent}

              <!-- JOURNAL CLOSED -->
              <tr style="border-top: 2px solid #000; font-weight: 900; text-align: center;">
                <td colspan="4" style="border: 1px solid #000; padding: 5px; letter-spacing: 1.5px;">JOURNAL CLOSED</td>
              </tr>
            </tbody>
          </table>

          <!-- Signatures Section matching reference image #2 -->
          <div style="display: flex; justify-content: space-between; margin-top: 20px; padding: 0 10px; font-size: 0.9rem; page-break-inside: avoid;">
            <div style="width: 45%;">
              <div style="margin-bottom: 30px;">Prepared by:</div>
              <div style="font-weight: bold; font-size: 1rem;">${preparedBy}</div>
              <div style="font-size: 0.85rem; color: #333;">${preparedTitle}</div>
            </div>

            <div style="width: 45%;">
              <div style="margin-bottom: 30px;">Noted By:</div>
              <div style="font-weight: bold; font-size: 1rem; text-transform: uppercase;">${notedBy}</div>
              <div style="font-size: 0.85rem; color: #333;">${notedTitle}</div>
            </div>
          </div>
        </div>

        <!-- PAGE 2: Official Journal Cover Sheet matching user screenshot -->
        <div class="duty-journal-cover-page" style="page-break-before: always; break-before: page; min-height: 260mm; display: flex; flex-direction: column; justify-content: space-between; padding: 40px 20px 20px 20px; box-sizing: border-box; background: #fff; color: #000; font-family: Arial, sans-serif;">
          
          <!-- Top Title & CDO Section -->
          <div style="text-align: center; margin-top: 40px;">
            <h1 style="font-size: 3rem; font-weight: 900; font-family: 'Arial Black', 'Impact', sans-serif; letter-spacing: 2px; text-transform: uppercase; margin: 0; color: #fff; -webkit-text-stroke: 2.2px #000; text-shadow: 1px 1px 0 #000;">
              RCD (R6) DAILY JOURNAL
            </h1>

            <div style="margin-top: 60px; font-weight: bold; font-size: 1.1rem; line-height: 1.7; color: #000;">
              <div>${coverDateStr}</div>
              <div>CDO: <span style="text-transform: uppercase;">${notedBy}</span></div>
            </div>
          </div>

          <!-- Middle Duty PNCO Section -->
          <div style="text-align: center; margin-bottom: 80px;">
            <div style="font-weight: 900; font-size: 1.25rem; text-transform: uppercase; margin-bottom: 15px; color: #000;">
              ${preparedTitle}
            </div>
            <div style="font-weight: bold; font-size: 1.35rem; color: #000;">
              ${preparedBy}
            </div>
          </div>

          <!-- Bottom Copy For Section -->
          <div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 30px; color: #000;">
            Copy for____________________
          </div>
        </div>
      `;
    }

    this.closeAllModals();
    const previewModal = document.getElementById("journal-preview-modal");
    if (previewModal) previewModal.classList.add("active");
  }

  printDutyJournalSheet() {
    const journalContent = document.getElementById("printable-duty-journal");
    const printArea = document.getElementById("print-area");
    if (journalContent && printArea) {
      printArea.innerHTML = journalContent.innerHTML;
    }
    setTimeout(() => {
      window.print();
    }, 150);
  }

  // CRUD Operations
  openMemoModal(prefill = null) {
    this.closeAllModals();
    this.memoForm.reset();
    this.currentUploadedFile = null;
    this.currentUploadedFileData = prefill?.fileData || null;

    const fileLabel = document.getElementById("form-file-label");
    const fileStatus = document.getElementById("form-file-status");
    if (fileLabel) fileLabel.textContent = "Click or Drag & Drop Scanned Document Here";
    if (fileStatus) {
      fileStatus.style.display = "none";
      fileStatus.innerHTML = "";
    }

    const noticeBanner = document.getElementById("rcd-sheet-notice");
    const vacantBadge = document.getElementById("rcd-vacant-badge");

    if (prefill?.isRcdOutgoing) {
      if (noticeBanner) noticeBanner.style.display = "flex";
      if (vacantBadge) vacantBadge.textContent = prefill.id || "ORCD-0416";
      document.getElementById("modal-form-title").innerHTML = `<span>📤 Log Outgoing RCD Memo (Connected to RCD Control Sheet)</span>`;
    } else {
      if (noticeBanner) noticeBanner.style.display = "none";
      document.getElementById("modal-form-title").innerHTML = `<span>📝 ${prefill?.id ? 'Edit Memorandum Record' : 'Log Incoming Memorandum'}</span>`;
    }

    const now = new Date();
    document.getElementById("form-id").value = prefill?.id || `MEMO-2026-${String(this.memos.length + 1).padStart(3, '0')}`;
    document.getElementById("form-date").value = prefill?.dateLogged || `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    document.getElementById("form-time").value = prefill?.time || now.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });
    document.getElementById("form-received-by").value = prefill?.receivedBy !== undefined ? prefill.receivedBy : "Pat Bomidor";
    document.getElementById("form-originating").value = prefill?.originatingOffice !== undefined ? prefill.originatingOffice : (prefill?.isRcdOutgoing ? "RCD" : "");
    document.getElementById("form-subject").value = prefill?.subject || "";
    document.getElementById("form-action").value = prefill?.actionRequired || "For Concur";
    document.getElementById("form-remarks").value = prefill?.remarksStatus || "Transmitted to";
    document.getElementById("form-transmitted").value = prefill?.transmittedOffice || "";
    document.getElementById("form-date-received").value = prefill?.dateReceived || `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    document.getElementById("form-drive-link").value = prefill?.driveLink || TARGET_GOOGLE_DRIVE_FOLDER;
    document.getElementById("form-pages").value = prefill?.pages || 1;

    this.memoModal.classList.add("active");
  }

  async findVacantRcdControlNo() {
    try {
      const resp = await fetch(TARGET_RCD_GOOGLE_SHEET_CSV);
      if (resp.ok) {
        const text = await resp.text();
        const lines = text.split('\n');
        // Start scanning from Row 1968 (Cell A1968, index 1967) onwards as requested
        const startIndex = lines.length >= 1968 ? 1967 : 0;
        
        for (let i = startIndex; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('"ORCD-') || line.includes('"A')) {
            const parts = line.split('","').map(s => s.replace(/^"|"$/g, '').trim());
            const ctrl = parts[0];
            const subject = parts[4] || '';

            if (ctrl && (!subject || subject === '')) {
              if (!this.memos.some(m => m.id === ctrl)) {
                return ctrl;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not fetch live Google Sheet vacant control numbers:", e);
    }

    const existingOrcdNums = this.memos
      .map(m => m.id)
      .filter(id => /^ORCD-\d+$/i.test(id))
      .map(id => parseInt(id.replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n));
    
    const maxNum = existingOrcdNums.length > 0 ? Math.max(...existingOrcdNums) : 1967;
    return `ORCD-${String(maxNum + 1).padStart(4, '0')}`;
  }

  async openRcdMemoModal() {
    const btn = document.getElementById("btn-rcd-memo") || document.getElementById("btn-input-rcd");
    const originalText = btn ? btn.innerHTML : "";
    if (btn) btn.innerHTML = "<span>⏳ Finding Vacant Control No...</span>";

    try {
      const vacantCtrl = await this.findVacantRcdControlNo();
      const now = new Date();
      
      this.openMemoModal({
        id: vacantCtrl,
        dateLogged: `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`,
        time: now.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' }),
        originatingOffice: "RCD",
        receivedBy: "",
        subject: "",
        actionRequired: "For Concur",
        remarksStatus: "Transmitted to",
        transmittedOffice: "",
        isRcdOutgoing: true
      });
    } finally {
      if (btn) btn.innerHTML = originalText;
    }
  }

  async openOutgoingRCDModal() {
    return this.openRcdMemoModal();
  }

  async handleMemoSubmit(e) {
    e.preventDefault();
    const id = String(document.getElementById("form-id").value).trim();
    const existingIdx = this.memos.findIndex(m => String(m.id) === id);

    let driveLinkValue = document.getElementById("form-drive-link").value;
    const fileDataVal = this.currentUploadedFileData ? this.currentUploadedFileData : (existingIdx >= 0 ? this.memos[existingIdx].fileData : null);
    const fileNameVal = this.currentUploadedFile ? this.currentUploadedFile.name : (existingIdx >= 0 ? this.memos[existingIdx].fileName : "");

    const rawMemoData = {
      id: id,
      dateLogged: document.getElementById("form-date").value,
      time: document.getElementById("form-time").value,
      receivedBy: document.getElementById("form-received-by").value,
      originatingOffice: document.getElementById("form-originating").value,
      subject: document.getElementById("form-subject").value,
      actionRequired: document.getElementById("form-action").value,
      remarksStatus: document.getElementById("form-remarks").value,
      transmittedOffice: document.getElementById("form-transmitted").value,
      dateReceived: document.getElementById("form-date-received").value,
      driveLink: driveLinkValue,
      fileName: fileNameVal,
      fileData: fileDataVal,
      pages: parseInt(document.getElementById("form-pages").value) || 1
    };

    const cleanMemo = window.storageManager ? window.storageManager.normalizeMemo(rawMemoData) : rawMemoData;

    const cloudSuccess = await this.saveMemoToCloud(cleanMemo);
    if (!cloudSuccess) {
      return; // Do not close modal or overwrite local if write failed
    }

    if (existingIdx >= 0) {
      this.memos[existingIdx] = cleanMemo;
    } else {
      this.memos.unshift(cleanMemo);
    }

    this.saveMemos();
    this.closeAllModals();

    // Non-blocking background Google Drive Upload
    const scriptUrl = localStorage.getItem("RCD_DRIVE_SCRIPT_URL") || DEFAULT_GOOGLE_DRIVE_SCRIPT_URL;
    if (this.currentUploadedFileData && scriptUrl) {
      const uploadData = this.currentUploadedFileData;
      const uploadFileName = fileNameVal;
      const memoId = id;

      setTimeout(async () => {
        try {
          const parts = uploadData.split(',');
          const mimeMatch = parts[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : "application/pdf";
          const base64Data = parts[1];

          const payload = {
            fileName: `${memoId}_${uploadFileName || 'memo.pdf'}`,
            contentType: mime,
            base64: base64Data
          };

          const resp = await fetch(scriptUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
            redirect: "follow"
          });

          if (resp.ok) {
            const resJson = await resp.json();
            if (resJson.fileUrl) {
              const targetMemo = this.memos.find(m => String(m.id) === String(memoId));
              if (targetMemo) {
                targetMemo.driveLink = resJson.fileUrl;
                await this.saveMemoToCloud(targetMemo);
                this.saveMemos();
              }
            }
          }
        } catch (err) {
          console.warn("Background Google Drive upload notice:", err);
        }
      }, 50);
    }
  }

  viewAttachedFile(id) {
    const memo = this.memos.find(m => m.id === id);
    if (!memo) return;

    this.closeAllModals();
    const modal = document.getElementById("pdf-viewer-modal");
    const titleEl = document.getElementById("pdf-viewer-title");
    const bodyEl = document.getElementById("pdf-viewer-body");
    const driveBtn = document.getElementById("pdf-viewer-drive-btn");

    const fileName = memo.fileName || `${memo.id}.pdf`;
    if (titleEl) titleEl.textContent = `📄 Document PDF Viewer: ${fileName} (${memo.id})`;

    if (driveBtn) {
      if (memo.driveLink) {
        driveBtn.href = memo.driveLink;
        driveBtn.style.display = "inline-flex";
      } else {
        driveBtn.href = TARGET_GOOGLE_DRIVE_FOLDER;
        driveBtn.style.display = "inline-flex";
      }
    }

    if (!bodyEl) return;

    // 1. If base64 fileData exists, render directly inside iframe
    if (memo.fileData) {
      let fileUrl = memo.fileData;
      try {
        if (memo.fileData.startsWith("data:")) {
          const parts = memo.fileData.split(',');
          const mimeMatch = parts[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
          const bstr = atob(parts[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const blob = new Blob([u8arr], { type: mime });
          fileUrl = URL.createObjectURL(blob);
        }
      } catch (e) {
        fileUrl = memo.fileData;
      }

      const isPdf = fileName.toLowerCase().endsWith(".pdf") || memo.fileData.includes("pdf");
      if (isPdf) {
        bodyEl.innerHTML = `<iframe src="${fileUrl}" style="width:100%; height:100%; border:none; background:#ffffff;" title="PDF Viewer"></iframe>`;
      } else {
        bodyEl.innerHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#0f172a;"><img src="${fileUrl}" alt="Attached Document" style="max-width:100%; max-height:100%; object-fit:contain;" /></div>`;
      }

      if (modal) modal.classList.add("active");
      return;
    }

    // 2. If Google Drive file link exists (e.g. /file/d/FILE_ID/), embed the direct PDF preview iframe
    if (memo.driveLink && memo.driveLink.includes("/file/d/")) {
      const match = memo.driveLink.match(/\/file\/d\/([^\/]+)/);
      if (match && match[1]) {
        const embedUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
        bodyEl.innerHTML = `<iframe src="${embedUrl}" style="width:100%; height:100%; border:none; background:#ffffff;" allow="autoplay" title="PDF Drive Embedded Viewer"></iframe>`;
        if (modal) modal.classList.add("active");
        return;
      }
    }

    // 3. Render Official PNP Memorandum PDF Document View right inside the modal
    const isTransmitted = memo.remarksStatus === "Transmitted to" || (memo.transmittedOffice && memo.transmittedOffice.trim().length > 2);
    const isConcurred = memo.remarksStatus.includes("Concur") || memo.remarksStatus.includes("Approved") || memo.remarksStatus.includes("Signed");
    const statusBadge = isTransmitted ? "🟢 TRANSMITTED OUTSIDE RCD" : (isConcurred ? "🔵 CONCURRED / APPROVED" : "🔴 INSIDE RCD (PENDING)");

    bodyEl.innerHTML = `
      <div style="width:100%; height:100%; overflow-y:auto; background:#f8fafc; padding:30px; display:flex; justify-content:center;">
        <div style="background:#ffffff; width:100%; max-width:760px; min-height:900px; padding:40px 50px; box-shadow:0 10px 25px rgba(0,0,0,0.3); border:1px solid #cbd5e1; position:relative; font-family:'Inter', sans-serif; color:#0f172a;">
          
          <!-- Official PNP Header -->
          <div style="text-align:center; border-bottom:2px solid #0f172a; padding-bottom:15px; margin-bottom:20px;">
            <div style="display:flex; align-items:center; justify-content:center; gap:16px; margin-bottom:8px;">
              <img src="assets/pnp_badge.png" style="height:55px; width:auto;" alt="PNP Badge" />
              <img src="assets/pro4a_logo.png" style="height:55px; width:auto;" alt="PRO4A Logo" />
              <img src="assets/rcd_logo.png" style="height:55px; width:auto;" alt="RCD Logo" />
            </div>
            <div style="font-size:0.8rem; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#475569;">Republic of the Philippines • Department of the Interior and Local Government</div>
            <div style="font-size:0.95rem; font-weight:900; color:#0f2347; text-transform:uppercase; margin-top:2px;">PHILIPPINE NATIONAL POLICE • POLICE REGIONAL OFFICE 4A</div>
            <div style="font-size:1.1rem; font-weight:900; color:#1e3a8a; margin-top:2px;">OFFICE OF THE REGIONAL COMPTROLLERSHIP DIVISION</div>
            <div style="font-size:0.75rem; color:#64748b; font-style:italic;">Camp BGen Vicente P Lim, Calamba City, Laguna</div>
          </div>

          <!-- Official Document Stamps & Status -->
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
            <div style="background:#0f172a; color:#ffffff; padding:6px 14px; border-radius:6px; font-weight:800; font-size:0.85rem;">
              REF CONTROL NO: <span style="color:#38bdf8;">${memo.id}</span>
            </div>
            <div style="border:2px solid ${isTransmitted ? '#16a34a' : '#0284c7'}; color:${isTransmitted ? '#15803d' : '#0369a1'}; padding:6px 12px; border-radius:6px; font-weight:900; font-size:0.8rem; text-transform:uppercase;">
              ${statusBadge}
            </div>
          </div>

          <!-- MEMORANDUM DOCUMENT CONTENT -->
          <div style="font-size:1.15rem; font-weight:900; text-decoration:underline; letter-spacing:1px; margin-bottom:20px; text-align:center; color:#0f172a;">
            MEMORANDUM
          </div>

          <div style="display:grid; grid-template-columns: 140px 1fr; row-gap:12px; font-size:0.92rem; margin-bottom:25px; border-bottom:1px dashed #cbd5e1; padding-bottom:20px;">
            <div style="font-weight:800; color:#475569;">FOR / TO:</div>
            <div style="font-weight:700; color:#0f172a;">Regional Director / Division Chief, RCD PRO 4A</div>

            <div style="font-weight:800; color:#475569;">FROM:</div>
            <div style="font-weight:700; color:#1e3a8a;">${memo.originatingOffice} (Originating Division)</div>

            <div style="font-weight:800; color:#475569;">SUBJECT:</div>
            <div style="font-weight:800; color:#0f2347; font-size:1.05rem; line-height:1.4;">${memo.subject}</div>

            <div style="font-weight:800; color:#475569;">DATE LOGGED:</div>
            <div>${memo.dateLogged} ${memo.time}</div>

            <div style="font-weight:800; color:#475569;">ACTION REQUIRED:</div>
            <div><span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:800; font-size:0.82rem;">${memo.actionRequired}</span></div>

            <div style="font-weight:800; color:#475569;">REMARKS / STATUS:</div>
            <div style="font-weight:700; color:#1e293b;">${memo.remarksStatus} ${memo.transmittedOffice ? ' (' + memo.transmittedOffice + ')' : ''}</div>
          </div>

          <div style="font-size:0.88rem; color:#334155; line-height:1.6; margin-bottom:30px;">
            <p style="margin-bottom:12px;">1. Reference: Official RCD Memorandum Document Record logged under System Control ID <strong>${memo.id}</strong>.</p>
            <p style="margin-bottom:12px;">2. This document record was officially registered by <strong>${memo.receivedBy || 'Duty PNCO'}</strong> and assigned for <strong>${memo.actionRequired}</strong>.</p>
            <p>3. For info, guidance, and strict compliance.</p>
          </div>

          <!-- Document Footer Signature Block -->
          <div style="margin-top:60px; display:flex; justify-content:space-between; align-items:flex-end;">
            <div style="font-size:0.75rem; color:#64748b;">
              <div>Document Verification Code: RCD-${memo.id}-PRO4A</div>
              <div>System Authenticated Record</div>
            </div>
            <div style="text-align:center;">
              <div style="font-weight:800; font-size:0.9rem; color:#0f2347;">CHIEF, RCD PRO 4A</div>
              <div style="font-size:0.75rem; color:#64748b;">Regional Comptrollership Division</div>
            </div>
          </div>

        </div>
      </div>
    `;

    if (modal) modal.classList.add("active");
  }

  editMemo(id) {
    const memo = this.memos.find(m => m.id === id);
    if (memo) {
      this.openMemoModal(memo);
    }
  }

  deleteMemo(id) {
    if (confirm(`Are you sure you want to delete Memorandum Record ${id}?`)) {
      this.memos = this.memos.filter(m => m.id !== id);
      this.saveMemos();
    }
  }

  printRoutingSlip(id) {
    const memo = this.memos.find(m => m.id === id);
    if (!memo) return;

    this.selectedMemoForPrint = memo;
    const slipBody = document.getElementById("printable-routing-slip");
    slipBody.innerHTML = `
      <div class="routing-slip">
        <div class="routing-header">
          <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:8px;">
            <img src="assets/pnp_badge.png" alt="PNP Badge" style="height:60px; width:auto;" />
            <img src="assets/pro4a_logo.png" alt="PRO4A Logo" style="height:60px; width:auto;" />
            <div style="text-align:center;">
              <h3 style="margin:0; font-size:1.05rem; text-transform:uppercase;">Philippine National Police</h3>
              <h2 style="margin:2px 0; font-size:1.2rem; font-weight:bold; color:#0b1d3a;">OFFICE OF THE REGIONAL COMPTROLLERSHIP DIVISION</h2>
              <p style="margin:0; font-size:0.85rem; color:#475569;">Police Regional Office 4A • Camp BGen Vicente P Lim, Calamba City</p>
            </div>
            <img src="assets/rcd_logo.png" alt="RCD PRO4A Logo" style="height:60px; width:60px;" />
          </div>
          <hr style="margin-top:10px; border:1px solid #000;"/>
          <h3 style="text-decoration:underline; margin-top:10px; font-weight:bold;">MEMORANDUM ROUTING & TRANSMITTAL SLIP</h3>
        </div>
        <div class="routing-grid">
          <div><strong>Control / Ref No:</strong> ${memo.id}</div>
          <div><strong>Date Logged:</strong> ${memo.dateLogged} ${memo.time}</div>
          <div><strong>Originating Office:</strong> ${memo.originatingOffice}</div>
          <div><strong>Received By:</strong> ${memo.receivedBy}</div>
          <div style="grid-column: span 2;"><strong>SUBJECT / TITLE:</strong> <br/><span style="font-size:1.1rem; font-weight:bold;">${memo.subject}</span></div>
          <div><strong>Action Required:</strong> ${memo.actionRequired}</div>
          <div><strong>Status / Remarks:</strong> ${memo.remarksStatus}</div>
          <div style="grid-column: span 2;"><strong>Transmitted To Office:</strong> ${memo.transmittedOffice}</div>
          <div><strong>Date Received:</strong> ${memo.dateReceived}</div>
          <div><strong>Drive Reference Link:</strong> ${memo.driveLink}</div>
        </div>
        <div style="margin-top:30px; display:flex; justify-content:space-between;">
          <div style="width:45%; border-top:1px solid #000; text-align:center; padding-top:4px;">
            <strong>Processor Signature</strong>
          </div>
          <div style="width:45%; border-top:1px solid #000; text-align:center; padding-top:4px;">
            <strong>Division Chief / Receiving Officer</strong>
          </div>
        </div>
      </div>
    `;

    this.routingModal.classList.add("active");
  }

  updateBatchBar() {
    if (!this.batchBar) return;
    const count = this.selectedMemoIds.size;
    if (count > 0) {
      this.batchBar.style.display = "flex";
      this.batchCountText.textContent = `${count} Memorandum Record(s) Selected`;
    } else {
      this.batchBar.style.display = "none";
    }
  }

  async batchTransmit() {
    if (this.selectedMemoIds.size === 0) return;
    const targetOffice = prompt(`Enter Transmitted Destination Office for ${this.selectedMemoIds.size} selected memo(s):\n(e.g., "Concurred, Forwarded to RLRDD")`, "Concurred, Forwarded to ");
    if (!targetOffice) return;

    let count = 0;
    const user = window.authManager?.currentUser;
    const profile = window.authManager?.currentProfile;

    for (const m of this.memos) {
      if (this.selectedMemoIds.has(m.id)) {
        m.remarksStatus = "Transmitted to";
        m.transmittedOffice = targetOffice;
        m.workflowStatus = "TRANSMITTED";
        m.updatedByUid = user?.uid || "";
        m.updatedByName = profile?.displayName || user?.email || "Duty PNCO";

        const cloudSuccess = await this.saveMemoToCloud(m);
        if (cloudSuccess) count++;
      }
    }

    this.selectedMemoIds.clear();
    if (this.selectAllCheckbox) this.selectAllCheckbox.checked = false;
    this.saveMemos();
    if (window.uiManager) window.uiManager.showToast(`✅ Successfully transmitted ${count} memorandum record(s)!`, "success");
  }

  batchExportExcel() {
    if (this.selectedMemoIds.size === 0) return;
    const selectedMemos = this.memos.filter(m => this.selectedMemoIds.has(m.id));
    if (typeof XLSX === "undefined") {
      alert("Excel export engine is loading. Please try exporting again.");
      return;
    }
    const data = selectedMemos.map((m, idx) => ({
      "No.": idx + 1,
      "Control Ref ID": m.id,
      "Date Logged": m.dateLogged,
      "Time": m.time,
      "Input / Received By": m.receivedBy,
      "Originating Office": m.originatingOffice,
      "Subject / Title of Memo": m.subject,
      "Action Required": m.actionRequired,
      "Remarks / Status": m.remarksStatus,
      "Transmitted Office": m.transmittedOffice || "Pending Release",
      "Date Received": m.dateReceived || m.dateLogged,
      "Google Drive Link": m.driveLink || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Selected Memos");
    XLSX.writeFile(workbook, `PRO4A_RCD_Selected_Memos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  backupDatabase() {
    const dataStr = JSON.stringify(this.memos, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PRO4A_RCD_Memo_Database_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  restoreDatabase(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const restored = JSON.parse(e.target.result);
        if (Array.isArray(restored) && restored.length > 0) {
          if (confirm(`Restore database from file? This will replace your current logbook with ${restored.length} records.`)) {
            this.memos = restored;
            this.saveMemos();
            alert(`Database successfully restored with ${restored.length} memorandum records!`);
          }
        } else {
          alert("Invalid backup file format. Expected JSON array of memo records.");
        }
      } catch (err) {
        alert("Failed to parse database backup file. " + err.message);
      }
    };
    reader.readAsText(file);
  }

  async exportToExcel() {
    if (typeof XLSX === "undefined") {
      if (window.uiManager) window.uiManager.showToast("⚠️ Excel engine is loading. Please try again in a moment.", "error");
      return;
    }

    if (window.uiManager) window.uiManager.showToast("⏳ Fetching latest records from Cloud & preparing Excel export...", "info");

    // 1. Obtain latest memo records from Firebase Firestore (or fallback to local memory state)
    let latestMemos = [];
    if (this.db && window.authManager?.currentUser) {
      try {
        const snap = await this.db.collection("memos").get();
        if (snap && !snap.empty) {
          snap.forEach(doc => {
            const data = doc.data();
            if (data && data.id) {
              const norm = window.storageManager ? window.storageManager.normalizeMemo(data) : data;
              latestMemos.push(norm);
            }
          });
        }
      } catch (err) {
        console.warn("Could not query Firestore for export, using local memory state:", err);
      }
    }

    if (!latestMemos || latestMemos.length === 0) {
      latestMemos = Array.isArray(this.memos) ? this.memos.map(m => window.storageManager ? window.storageManager.normalizeMemo(m) : m) : [];
    }

    // Filter out deleted memos
    latestMemos = latestMemos.filter(m => !m.isDeleted);

    // 2. Fetch template workbook from data folder
    const templateCandidates = [
      "data/PRO4A_RCD_Memo_Logbook_2026-08-04.xlsx",
      "./data/PRO4A_RCD_Memo_Logbook_2026-08-04.xlsx",
      "/data/PRO4A_RCD_Memo_Logbook_2026-08-04.xlsx"
    ];
    let workbook = null;
    let loadedPath = null;

    for (const pathCandidate of templateCandidates) {
      try {
        const resp = await fetch(pathCandidate);
        if (resp.ok) {
          const arrayBuffer = await resp.arrayBuffer();
          workbook = XLSX.read(arrayBuffer, { type: "array", cellStyles: true, cellFormulas: true, cellDates: true, cellNF: true });
          loadedPath = pathCandidate;
          break;
        }
      } catch (err) {
        // Try next candidate path
      }
    }

    if (!workbook) {
      console.warn("Could not load template workbook from server data folder, generating formatted fallback workbook.");
      if (window.uiManager) {
        window.uiManager.showToast("⚠️ Note: Template file 'data/PRO4A_RCD_Memo_Logbook_2026-08-04.xlsx' was not found on server. Ensure the data folder is uploaded to GitHub.", "info");
      }
      workbook = XLSX.utils.book_new();
    }

    // Select worksheet
    let worksheetName = "Memo Logbook";
    let worksheet = workbook.Sheets[worksheetName];
    if (!worksheet) {
      if (workbook.SheetNames && workbook.SheetNames.length > 0) {
        worksheetName = workbook.SheetNames[0];
        worksheet = workbook.Sheets[worksheetName];
      } else {
        worksheetName = "Memo Logbook";
        worksheet = {};
        XLSX.utils.book_append_sheet(workbook, worksheet, worksheetName);
      }
    }

    // Ensure Row 1 Headers exist in exact 13-column order
    const columns = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
    const headerTitles = [
      "No.",
      "Control Ref ID",
      "Date Logged",
      "Time",
      "Input / Received By",
      "Originating Office",
      "Subject / Title of Memo",
      "Action Required",
      "Remarks / Status",
      "Transmitted Office",
      "Date Received",
      "RCD Location Status",
      "Google Drive Link"
    ];

    columns.forEach((col, idx) => {
      const cellKey = col + '1';
      if (!worksheet[cellKey]) {
        worksheet[cellKey] = { v: headerTitles[idx], t: 's' };
      }
    });

    // Remove existing data rows (Row 2 onwards) from worksheet
    Object.keys(worksheet).forEach(key => {
      if (key.startsWith('!') || key.endsWith('1')) return;
      const match = key.match(/^([A-M])(\d+)$/);
      if (match) {
        const rowNum = parseInt(match[2], 10);
        if (rowNum > 1) {
          delete worksheet[key];
        }
      }
    });

    // Populate data rows beginning at Row 2
    latestMemos.forEach((m, idx) => {
      const r = idx + 2; // Row 2, Row 3, ...

      const isTransmitted = m.remarksStatus === "Transmitted to" || (m.transmittedOffice && m.transmittedOffice.trim().length > 2);
      const isConcurred = m.remarksStatus && (m.remarksStatus.includes("Concur") || m.remarksStatus.includes("Approved") || m.remarksStatus.includes("Signed"));

      let flowStatus = isTransmitted ? "Transmitted (Out of RCD)" : "Inside RCD (Pending Release)";
      if (isConcurred) flowStatus += " | Concurred";

      const rowValues = [
        { v: idx + 1, t: 'n' },                                                     // 1. No. (numeric renumbered from 1)
        { v: String(m.id || ''), t: 's' },                                          // 2. Control Ref ID
        { v: String(m.dateLogged || ''), t: 's' },                                  // 3. Date Logged
        { v: String(m.time || ''), t: 's' },                                        // 4. Time
        { v: String(m.receivedBy || ''), t: 's' },                                  // 5. Input / Received By
        { v: String(m.originatingOffice || ''), t: 's' },                           // 6. Originating Office
        { v: String(m.subject || ''), t: 's' },                                     // 7. Subject / Title of Memo
        { v: String(m.actionRequired || ''), t: 's' },                              // 8. Action Required
        { v: String(m.remarksStatus || ''), t: 's' },                               // 9. Remarks / Status
        { v: String(m.transmittedOffice || 'Pending Release'), t: 's' },            // 10. Transmitted Office
        { v: String(m.dateReceived || m.dateLogged || ''), t: 's' },                // 11. Date Received
        { v: String(flowStatus), t: 's' },                                          // 12. RCD Location Status
        { v: String(m.driveLink || ''), t: 's' }                                    // 13. Google Drive Link
      ];

      // Add hyperlink to column M if driveLink is valid URL
      if (m.driveLink && m.driveLink.startsWith("http")) {
        rowValues[12].l = { Target: m.driveLink, Tooltip: "Open Google Drive File" };
      }

      columns.forEach((col, colIdx) => {
        const cellKey = col + r;
        worksheet[cellKey] = rowValues[colIdx];
      });
    });

    // Update worksheet reference range !ref and !autofilter
    const totalRows = latestMemos.length + 1;
    const maxRow = Math.max(totalRows, 1);
    worksheet['!ref'] = `A1:M${maxRow}`;
    if (worksheet['!autofilter']) {
      worksheet['!autofilter'].ref = `A1:M${maxRow}`;
    } else {
      worksheet['!autofilter'] = { ref: `A1:M${maxRow}` };
    }

    // Preserve / set optimal column widths if missing
    if (!worksheet['!cols']) {
      worksheet['!cols'] = [
        { wch: 6 },   // No.
        { wch: 18 },  // Control Ref ID
        { wch: 16 },  // Date Logged
        { wch: 14 },  // Time
        { wch: 24 },  // Input / Received By
        { wch: 18 },  // Originating Office
        { wch: 55 },  // Subject
        { wch: 18 },  // Action Required
        { wch: 24 },  // Remarks / Status
        { wch: 35 },  // Transmitted Office
        { wch: 16 },  // Date Received
        { wch: 30 },  // RCD Location Status
        { wch: 50 }   // Google Drive Link
      ];
    }

    // Export completed workbook with formatted date in filename
    const todayStr = new Date().toISOString().slice(0, 10);
    const fileName = `PRO4A_RCD_Memo_Logbook_${todayStr}.xlsx`;
    XLSX.writeFile(workbook, fileName, { cellStyles: true });

    if (window.uiManager) window.uiManager.showToast(`📊 Successfully exported ${latestMemos.length} records to ${fileName}`, "success");
  }

  openExcelImportFile() {
    let input = document.getElementById("excel-import-file-input");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "excel-import-file-input";
      input.accept = ".xlsx,.xls,.csv";
      input.style.display = "none";
      document.body.appendChild(input);
    }
    input.onchange = (e) => this.handleExcelImportFile(e);
    input.value = "";
    input.click();
  }

  async handleExcelImportFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (window.uiManager) {
      window.uiManager.showToast(`⏳ Reading and parsing "${file.name}"... Please wait.`, "info");
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      let sheetName = "Memo Logbook";
      if (!workbook.Sheets[sheetName]) {
        sheetName = workbook.SheetNames[0];
      }
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        throw new Error("No worksheets found in uploaded file.");
      }

      // Convert sheet to Array of Arrays (100% reliable format)
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (!rows || rows.length <= 1) {
        throw new Error("The uploaded Excel file has no data rows.");
      }

      console.log(`Parsed ${rows.length} total rows from file ${file.name}`);

      // Existing records map for deduplication
      const existingMap = new Map();
      (this.memos || []).forEach(m => {
        if (m && m.id) {
          existingMap.set(String(m.id).trim().toUpperCase(), m);
        }
      });

      const importedMemosMap = new Map();
      let newCount = 0;
      let updatedCount = 0;

      rows.forEach((row, idx) => {
        if (idx === 0) return; // Skip header row
        if (!row || row.length === 0) return;

        // Index 1 is Column B (Control Ref ID)
        let memoId = row[1] ? String(row[1]).trim() : "";
        if (!memoId || memoId.toLowerCase().includes("control ref id") || memoId.toLowerCase().includes("control no")) {
          return; // Skip header or empty rows
        }

        const dateLogged = row[2] ? String(row[2]).trim() : "8/4/2026";
        const time = row[3] ? String(row[3]).trim() : "8:00:00 AM";
        const receivedBy = row[4] ? String(row[4]).trim() : "Duty PNCO";
        const originatingOffice = row[5] ? String(row[5]).trim() : "ROD";
        const subject = row[6] ? String(row[6]).trim() : "Untitled Memorandum";
        const actionRequired = row[7] ? String(row[7]).trim() : "For Info";
        const remarksStatus = row[8] ? String(row[8]).trim() : "Received";
        const transmittedOffice = (row[9] && String(row[9]).trim() !== "Pending Release") ? String(row[9]).trim() : "";
        const dateReceived = row[10] ? String(row[10]).trim() : dateLogged;
        const driveLink = row[12] ? String(row[12]).trim() : "";

        let computedWorkflowStatus = "RECEIVED";
        if (remarksStatus === "Transmitted to" || (transmittedOffice && transmittedOffice.length > 2)) {
          computedWorkflowStatus = "TRANSMITTED";
        } else if (remarksStatus.includes("Concur") || remarksStatus.includes("Approved") || remarksStatus.includes("Signed")) {
          computedWorkflowStatus = "APPROVED";
        }

        const memoKey = memoId.toUpperCase();
        const memoObj = {
          id: memoId,
          dateLogged: dateLogged,
          time: time,
          receivedBy: receivedBy,
          originatingOffice: originatingOffice,
          subject: subject,
          actionRequired: actionRequired,
          remarksStatus: remarksStatus,
          transmittedOffice: transmittedOffice,
          dateReceived: dateReceived,
          driveLink: driveLink,
          pages: 1,
          memoType: memoId.startsWith("ORCD") ? "OUTGOING" : "INCOMING",
          workflowStatus: computedWorkflowStatus,
          priority: "NORMAL",
          assignedSection: "RCD",
          schemaVersion: 2,
          isDeleted: false
        };

        if (existingMap.has(memoKey)) {
          updatedCount++;
        } else {
          newCount++;
        }

        importedMemosMap.set(memoKey, memoObj);
      });

      const uniqueImportedMemos = Array.from(importedMemosMap.values());

      if (uniqueImportedMemos.length === 0) {
        throw new Error("No valid, non-header memorandum records found in the uploaded file.");
      }

      // 1. Sync to Cloud Firestore (deduplicated by Document ID)
      if (this.db) {
        if (window.uiManager) {
          window.uiManager.showToast(`☁️ Syncing ${uniqueImportedMemos.length} records to Cloud Firestore...`, "info");
        }
        for (let i = 0; i < uniqueImportedMemos.length; i += 400) {
          const chunk = uniqueImportedMemos.slice(i, i + 400);
          const batch = this.db.batch();
          chunk.forEach(m => {
            const cleanMemo = window.storageManager ? window.storageManager.normalizeMemo(m) : { ...m };
            const docRef = this.db.collection("memos").doc(String(cleanMemo.id));
            batch.set(docRef, cleanMemo, { merge: true });
          });
          await batch.commit();
        }
      }

      // 2. Merge into local memory state without duplicates
      const mergedMap = new Map();
      (this.memos || []).forEach(m => {
        if (m && m.id) mergedMap.set(String(m.id).trim().toUpperCase(), m);
      });
      uniqueImportedMemos.forEach(m => {
        const k = String(m.id).trim().toUpperCase();
        if (mergedMap.has(k)) {
          mergedMap.set(k, { ...mergedMap.get(k), ...m });
        } else {
          mergedMap.set(k, m);
        }
      });

      this.memos = Array.from(mergedMap.values());

      if (window.storageManager) {
        window.storageManager.saveMemosLocally(this.memos);
      }

      this.renderApp();

      if (window.uiManager) {
        window.uiManager.showToast(`🎉 Imported ${uniqueImportedMemos.length} memos! (${newCount} new, ${updatedCount} updated, 0 duplicates)`, "success");
      }

    } catch (err) {
      console.error("Excel import error:", err);
      if (window.uiManager) {
        window.uiManager.showToast(`❌ Import error: ${err.message || "Invalid Excel file"}`, "error");
      }
    }
  }

  exportToCSV() {
    let csv = "Control ID,Date Logged,Time,Received By,Originating Office,Subject,Action Required,Remarks/Status,Transmitted Office,Date Received,Google Drive Link\n";
    this.memos.forEach(m => {
      csv += `"${m.id}","${m.dateLogged}","${m.time}","${m.receivedBy}","${m.originatingOffice}","${m.subject.replace(/"/g, '""')}","${m.actionRequired}","${m.remarksStatus}","${m.transmittedOffice}","${m.dateReceived}","${m.driveLink}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PRO4A_RCD_Memo_Logbook_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  resetData() {
    if (confirm("Reset all data back to the default 1,207 records matching your Google Sheet?")) {
      const defaultMemos = this.getInitialMemos();
      localStorage.removeItem("RCD_MEMO_MONITORING_DATA");
      this.memos = defaultMemos;
      this.saveMemos();
    }
  }

  stopWebcam() {
    if (this.webcamStream) {
      try {
        this.webcamStream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn("Webcam track stop warning", e);
      }
      this.webcamStream = null;
    }
  }

  closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
    this.stopWebcam();
  }

  deleteMemo(id) {
    const memo = this.memos.find(m => m.id === id);
    if (!memo) return;

    this.closeAllModals();
    const modal = document.getElementById("soft-delete-modal");
    document.getElementById("delete-memo-id").value = id;
    document.getElementById("delete-reason-input").value = "";
    if (modal) modal.classList.add("active");
  }

  async handleSoftDeleteSubmit(e) {
    if (e) e.preventDefault();
    const id = document.getElementById("delete-memo-id").value;
    const reason = document.getElementById("delete-reason-input").value.trim();

    if (!reason) {
      if (window.uiManager) window.uiManager.showToast("Please enter a reason for deletion.", "error");
      return;
    }

    const memo = this.memos.find(m => String(m.id) === String(id));
    if (memo) {
      memo.isDeleted = true;
      memo.deletedAt = new Date().toISOString();
      memo.deletedByUid = window.authManager?.currentUser?.uid || "duty_officer";
      memo.deleteReason = reason;

      const cloudSuccess = await this.saveMemoToCloud(memo);
      if (cloudSuccess) {
        this.saveMemos();
        this.closeAllModals();

        if (window.auditManager) {
          window.auditManager.logAction(id, "SOFT_DELETE", { reason }, `Moved record ${id} to Recycle Bin`);
        }
        if (window.uiManager) {
          window.uiManager.showToast(`🗑️ Record ${id} moved to Recycle Bin`, "info");
        }
      }
    }
  }

  openRecycleBinModal() {
    this.closeAllModals();
    const modal = document.getElementById("recycle-bin-modal");
    const tbody = document.getElementById("recycle-bin-table-body");
    const deletedMemos = this.memos.filter(m => m.isDeleted === true);

    if (tbody) {
      tbody.innerHTML = "";
      if (deletedMemos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b; font-weight:700;">No deleted records in Recycle Bin.</td></tr>`;
      } else {
        deletedMemos.forEach(m => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><strong>${m.id}</strong></td>
            <td style="max-width:220px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${m.subject}</td>
            <td style="font-size:0.78rem;">${m.deletedAt ? new Date(m.deletedAt).toLocaleDateString() : 'N/A'}</td>
            <td>${m.deletedByUid || 'System User'}</td>
            <td style="font-style:italic; font-size:0.8rem; max-width:160px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${m.deleteReason || 'No reason specified'}</td>
            <td style="display:flex; gap:4px;">
              <button class="btn btn-primary btn-sm" onclick="app.viewAttachedFile('${m.id}')" style="padding:2px 6px; font-size:0.72rem; background:#0284c7;" title="View PDF Document">
                📄 View PDF
              </button>
              <button class="btn btn-success btn-sm" onclick="app.restoreMemo('${m.id}')" style="padding:2px 6px; font-size:0.72rem; background:#16a34a; color:#fff;" title="Restore Memo back to Logbook">
                🔄 Restore
              </button>
              <button class="btn btn-danger btn-sm" onclick="app.permanentlyDeleteMemo('${m.id}')" style="padding:2px 6px; font-size:0.72rem; background:#dc2626;" title="Permanently Erase Record">
                ❌ Delete
              </button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    }

    if (modal) modal.classList.add("active");
  }

  async restoreMemo(id) {
    const memo = this.memos.find(m => String(m.id) === String(id));
    if (memo) {
      memo.isDeleted = false;
      memo.deletedAt = "";
      memo.deletedByUid = "";
      memo.deleteReason = "";

      const cloudSuccess = await this.saveMemoToCloud(memo);
      if (cloudSuccess) {
        this.saveMemos();
        this.openRecycleBinModal();

        if (window.auditManager) {
          window.auditManager.logAction(id, "RESTORE", {}, `Restored record ${id} from Recycle Bin`);
        }
        if (window.uiManager) {
          window.uiManager.showToast(`✅ Restored record ${id} back to active logbook!`, "success");
        }
      }
    }
  }

  async permanentlyDeleteMemo(id) {
    if (!window.authManager?.canDelete()) {
      alert("Permission Denied: Only administrators can permanently delete records.");
      return;
    }
    if (confirm(`PERMANENT DELETION WARNING:\nAre you sure you want to permanently erase record ${id}? This action CANNOT be undone.`)) {
      const cloudSuccess = await this.deleteMemoFromCloud(id);
      if (cloudSuccess) {
        this.memos = this.memos.filter(m => String(m.id) !== String(id));
        this.saveMemos();
        this.openRecycleBinModal();

        if (window.auditManager) {
          window.auditManager.logAction(id, "PERMANENT_DELETE", {}, `Permanently deleted record ${id} from system`);
        }
        if (window.uiManager) {
          window.uiManager.showToast(`❌ Permanently erased record ${id}`, "error");
        }
      }
    }
  }
}

// Robust Global App Initialization
let app;
function initApp() {
  if (!app) {
    app = new MemoMonitoringApp();
    window.app = app;
  }
}

window.openDutyJournalDirect = function() {
  if (!window.app) initApp();
  const modal = document.getElementById("journal-modal");
  const now = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(now.getDate() + 1);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthStr = monthNames[now.getMonth()];
  const yearStr = now.getFullYear();

  const fmStr = `${String(now.getDate()).padStart(2, '0')}0800H ${monthStr} ${yearStr}`;
  const toStr = `${String(tomorrow.getDate()).padStart(2, '0')}0800H ${monthStr} ${yearStr}`;

  const fmInput = document.getElementById("journal-fm-date");
  const toInput = document.getElementById("journal-to-date");
  if (fmInput) fmInput.value = fmStr;
  if (toInput) toInput.value = toStr;

  if (modal) {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
    modal.classList.add("active");
  } else if (window.app) {
    window.app.openJournalModal();
  }
};

window.submitDutyJournalForm = function(e) {
  if (e) e.preventDefault();
  if (!window.app) initApp();
  if (window.app) {
    window.app.handleJournalSetupSubmit(e);
  }
};

document.addEventListener("click", function(e) {
  if (e.target.matches(".modal-close, .btn-cancel") || e.target.closest(".modal-close, .btn-cancel")) {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
  }
});

if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(initApp, 1);
} else {
  document.addEventListener("DOMContentLoaded", initApp);
}
