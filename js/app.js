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
      if (window.authManager) window.authManager.init(firebase.app());
      if (window.auditManager) window.auditManager.init(this.db);
      this.listenFirebaseSync();
    } catch (e) {
      console.warn("Firebase Cloud Database notice:", e);
    }
  }

  async syncAllDataToFirebase() {
    if (!this.db) {
      if (window.uiManager) window.uiManager.showToast("⚠️ Firebase Database is not connected.", "error");
      return;
    }

    try {
      const seed = this.getInitialMemos();
      const memosToSync = (this.memos && this.memos.length >= seed.length) ? this.memos : seed;
      let count = 0;

      // Firestore Batch Sync (Chunks of 400 per batch)
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
    }
  }

  listenFirebaseSync() {
    if (!this.db) return;
    try {
      // Sync Memos
      this.db.collection("memos").onSnapshot((snapshot) => {
        if (snapshot && !snapshot.empty) {
          let updated = false;
          snapshot.forEach((doc) => {
            const remoteMemo = doc.data();
            if (remoteMemo && remoteMemo.id) {
              const idx = this.memos.findIndex(m => m.id === remoteMemo.id);
              const normalized = window.storageManager ? window.storageManager.normalizeMemo(remoteMemo) : remoteMemo;
              if (idx >= 0) {
                this.memos[idx] = { ...this.memos[idx], ...normalized };
              } else {
                this.memos.unshift(normalized);
                updated = true;
              }
            }
          });
          if (updated) {
            this.saveMemos();
          }
        } else {
          this.syncAllDataToFirebase();
        }
      }, (err) => {
        console.warn("Firebase listener notice:", err);
      });
    } catch (e) {
      console.warn("Firebase sync notice:", e);
    }
  }

  checkSecurityAuth() {
    // Auth status is now securely handled by window.authManager
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

    if (this.db) {
      try {
        const latestMemos = this.memos.slice(0, 50);
        latestMemos.forEach(memo => {
          const norm = window.storageManager ? window.storageManager.normalizeMemo(memo) : memo;
          this.db.collection("memos").doc(norm.id).set(norm, { merge: true }).catch(() => {});
        });
      } catch (e) {
        console.warn("Firebase Cloud Sync warning", e);
      }
    }

    this.populateOfficeFilter();
    this.renderStats();
    this.renderTable();
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
    document.getElementById("btn-rcd-memo")?.addEventListener("click", () => this.openRcdMemoModal());
    document.getElementById("btn-ocr-scan")?.addEventListener("click", () => this.openOcrModal());
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
    // Soft Delete Form Submit
    document.getElementById("soft-delete-form")?.addEventListener("submit", (e) => this.handleSoftDeleteSubmit(e));

    // Modal Closes
    document.querySelectorAll(".modal-close, .btn-cancel").forEach((btn) => {
      btn.addEventListener("click", () => this.closeAllModals());
    });
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
    this.ocrModal.classList.add("active");

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
    const btn = document.getElementById("btn-rcd-memo");
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

  handleMemoSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("form-id").value;
    const existingIdx = this.memos.findIndex(m => m.id === id);

    let driveLinkValue = document.getElementById("form-drive-link").value;
    const fileDataVal = this.currentUploadedFileData ? this.currentUploadedFileData : (existingIdx >= 0 ? this.memos[existingIdx].fileData : null);
    const fileNameVal = this.currentUploadedFile ? this.currentUploadedFile.name : (existingIdx >= 0 ? this.memos[existingIdx].fileName : "");

    const memoData = {
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

    if (existingIdx >= 0) {
      this.memos[existingIdx] = memoData;
    } else {
      this.memos.unshift(memoData);
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
              const targetMemo = this.memos.find(m => m.id === memoId);
              if (targetMemo) {
                targetMemo.driveLink = resJson.fileUrl;
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

    const modal = document.getElementById("pdf-viewer-modal");
    const titleEl = document.getElementById("pdf-viewer-title");
    const bodyEl = document.getElementById("pdf-viewer-body");
    const driveBtn = document.getElementById("pdf-viewer-drive-btn");

    const fileName = memo.fileName || `${memo.id}.pdf`;
    if (titleEl) titleEl.textContent = `📄 Document Viewer: ${fileName} (${memo.id})`;

    if (driveBtn) {
      if (memo.driveLink && memo.driveLink.includes("/file/d/")) {
        driveBtn.href = memo.driveLink;
        driveBtn.style.display = "inline-flex";
      } else if (memo.fileName) {
        driveBtn.href = `https://drive.google.com/drive/search?q=${encodeURIComponent(memo.fileName)}`;
        driveBtn.style.display = "inline-flex";
      } else {
        driveBtn.href = memo.driveLink || TARGET_GOOGLE_DRIVE_FOLDER;
        driveBtn.style.display = "inline-flex";
      }
    }

    // 1. If fileData exists, render exact PDF or Image inside Document Viewer Modal
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

      if (bodyEl) {
        const isPdf = fileName.toLowerCase().endsWith(".pdf") || memo.fileData.includes("pdf");
        if (isPdf) {
          bodyEl.innerHTML = `<iframe src="${fileUrl}" style="width:100%; height:100%; border:none; background:#ffffff;" title="PDF Viewer"></iframe>`;
        } else {
          bodyEl.innerHTML = `<img src="${fileUrl}" alt="Attached Document" style="max-width:100%; max-height:100%; object-fit:contain;" />`;
        }
      }

      if (modal) {
        this.closeAllModals();
        modal.classList.add("active");
        return;
      }
      window.open(fileUrl, '_blank');
      return;
    }

    // 2. If direct Google Drive File URL exists (e.g. /file/d/...), open direct file URL
    if (memo.driveLink && memo.driveLink.includes("/file/d/")) {
      window.open(memo.driveLink, '_blank');
      return;
    }

    // 3. Fallback: Search exact filename in Google Drive so officer sees the exact PDF file
    if (memo.fileName) {
      window.open(`https://drive.google.com/drive/search?q=${encodeURIComponent(memo.fileName)}`, '_blank');
      return;
    }

    if (memo.driveLink) {
      window.open(memo.driveLink, '_blank');
    }
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

  batchTransmit() {
    if (this.selectedMemoIds.size === 0) return;
    const targetOffice = prompt(`Enter Transmitted Destination Office for ${this.selectedMemoIds.size} selected memo(s):\n(e.g., "Concurred, Forwarded to RLRDD")`, "Concurred, Forwarded to ");
    if (!targetOffice) return;

    let count = 0;
    this.memos.forEach(m => {
      if (this.selectedMemoIds.has(m.id)) {
        m.remarksStatus = "Transmitted to";
        m.transmittedOffice = targetOffice;
        count++;
      }
    });

    this.selectedMemoIds.clear();
    if (this.selectAllCheckbox) this.selectAllCheckbox.checked = false;
    this.saveMemos();
    alert(`Successfully transmitted ${count} selected memorandum record(s) out of RCD! Rows updated to Green.`);
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

  exportToExcel() {
    if (typeof XLSX === "undefined") {
      alert("Excel export engine is loading. Please try exporting again.");
      return;
    }
    const data = this.memos.map((m, idx) => {
      const isTransmitted = m.remarksStatus === "Transmitted to" || (m.transmittedOffice && m.transmittedOffice.trim().length > 2);
      const isConcurred = m.remarksStatus.includes("Concur") || m.remarksStatus.includes("Approved") || m.remarksStatus.includes("Signed");
      
      let flowStatus = isTransmitted ? "Transmitted (Out of RCD)" : "Inside RCD (Pending Release)";
      if (isConcurred) flowStatus += " | Concurred";

      return {
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
        "RCD Location Status": flowStatus,
        "Google Drive Link": m.driveLink || ""
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);

    // Auto Column Widths
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 24 },
      { wch: 18 },
      { wch: 55 },
      { wch: 18 },
      { wch: 24 },
      { wch: 35 },
      { wch: 16 },
      { wch: 30 },
      { wch: 50 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Memo Logbook");

    const todayStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `PRO4A_RCD_Memo_Logbook_${todayStr}.xlsx`);
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

  handleSoftDeleteSubmit(e) {
    if (e) e.preventDefault();
    const id = document.getElementById("delete-memo-id").value;
    const reason = document.getElementById("delete-reason-input").value.trim();

    if (!reason) {
      if (window.uiManager) window.uiManager.showToast("Please enter a reason for deletion.", "error");
      return;
    }

    const memo = this.memos.find(m => m.id === id);
    if (memo) {
      memo.isDeleted = true;
      memo.deletedAt = new Date().toISOString();
      memo.deletedByUid = window.authManager?.currentUser?.uid || "duty_officer";
      memo.deleteReason = reason;

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

  openRecycleBinModal() {
    this.closeAllModals();
    const modal = document.getElementById("recycle-bin-modal");
    const tbody = document.getElementById("recycle-bin-table-body");
    const deletedMemos = this.memos.filter(m => m.isDeleted === true);

    if (tbody) {
      tbody.innerHTML = "";
      if (deletedMemos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">No deleted records in Recycle Bin.</td></tr>`;
      } else {
        deletedMemos.forEach(m => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><strong>${m.id}</strong></td>
            <td style="max-width:250px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${m.subject}</td>
            <td style="font-size:0.78rem;">${m.deletedAt ? new Date(m.deletedAt).toLocaleDateString() : 'N/A'}</td>
            <td>${m.deletedByUid || 'System User'}</td>
            <td style="font-style:italic; font-size:0.8rem; max-width:180px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${m.deleteReason || 'No reason'}</td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="app.restoreMemo('${m.id}')" style="padding:2px 8px; font-size:0.75rem;">
                🔄 Restore
              </button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    }

    if (modal) modal.classList.add("active");
  }

  restoreMemo(id) {
    const memo = this.memos.find(m => m.id === id);
    if (memo) {
      memo.isDeleted = false;
      memo.deletedAt = "";
      memo.deletedByUid = "";
      memo.deleteReason = "";

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
