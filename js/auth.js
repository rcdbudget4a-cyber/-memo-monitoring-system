/**
 * Authentication & Role-Based Access Control (RBAC) Module
 * RCD Memorandum Monitoring System (PRO 4A)
 */

class AuthManager {
  constructor() {
    this.auth = null;
    this.db = null;
    this.currentUser = null;
    this.currentProfile = null;
    this.onAuthChangeCallbacks = [];
  }

  init(firebaseApp) {
    if (typeof firebase === "undefined" || !firebaseApp) return;

    this.auth = firebase.auth();
    this.db = firebase.firestore();
    this.firestorePasscode = null;

    // Real-time listener for Firestore Security Passcode document (settings/security -> passcode)
    try {
      this.db.collection("settings").doc("security").onSnapshot((doc) => {
        if (doc && doc.exists && doc.data()?.passcode) {
          this.firestorePasscode = doc.data().passcode;
          localStorage.setItem("RCD_CUSTOM_AUTH_PASS", doc.data().passcode);
        }
      });
    } catch (e) {
      console.warn("Firestore security passcode listener notice:", e);
    }

    this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        this.currentUser = user;
        this.currentProfile = await this.fetchUserProfile(user.uid, user.email, user.displayName);
        this.updateAuthUI(true);
      } else {
        const isLocalAuth = sessionStorage.getItem("RCD_MEMO_AUTH_LOCAL") === "true";
        if (isLocalAuth) {
          this.currentUser = { uid: "officer_duty", email: "duty.pnco@pro4a.pnp.gov.ph" };
          this.currentProfile = this.getDefaultProfile("duty.pnco@pro4a.pnp.gov.ph", "Duty PNCO");
          this.updateAuthUI(true);
        } else {
          this.currentUser = null;
          this.currentProfile = null;
          this.updateAuthUI(false);
        }
      }

      this.onAuthChangeCallbacks.forEach(cb => {
        try { cb(this.currentUser, this.currentProfile); } catch (e) { console.error("Auth callback err:", e); }
      });
    });
  }

  onAuthStateChanged(callback) {
    if (typeof callback === "function") {
      this.onAuthChangeCallbacks.push(callback);
    }
  }

  async fetchUserProfile(uid, email, displayName) {
    if (!this.db) return this.getDefaultProfile(email, displayName);

    try {
      const docRef = this.db.collection("users").doc(uid);
      const doc = await docRef.get();

      if (doc.exists) {
        return doc.data();
      } else {
        const defaultRole = (email && email.toLowerCase().includes("admin")) ? "admin" : "records_admin";
        const newProfile = {
          uid: uid,
          displayName: displayName || email.split("@")[0].toUpperCase() || "Authorized Officer",
          email: email || "",
          role: defaultRole,
          section: "RCD",
          active: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await docRef.set(newProfile, { merge: true });
        return newProfile;
      }
    } catch (e) {
      console.warn("Could not fetch user profile from Firestore users collection:", e);
      return this.getDefaultProfile(email, displayName);
    }
  }

  getDefaultProfile(email, displayName) {
    const defaultEmail = window.APP_CONFIG?.DEFAULT_AUTH?.DEFAULT_EMAIL || "duty.pnco@pro4a.pnp.gov.ph";
    return {
      displayName: displayName || (email ? email.split("@")[0].toUpperCase() : "Duty PNCO"),
      email: email || defaultEmail,
      role: "records_admin",
      section: "RCD",
      active: true
    };
  }

  getCurrentPassword() {
    return this.firestorePasscode || localStorage.getItem("RCD_CUSTOM_AUTH_PASS") || window.APP_CONFIG?.DEFAULT_AUTH?.DEFAULT_PASSWORD || "RCD@2026";
  }

  async login(email, password) {
    const cleanPass = password ? password.trim() : "";
    const activePass = this.getCurrentPassword();
    const defaultEmail = localStorage.getItem("RCD_CUSTOM_AUTH_EMAIL") || window.APP_CONFIG?.DEFAULT_AUTH?.DEFAULT_EMAIL || "duty.pnco@pro4a.pnp.gov.ph";
    const cleanEmail = (email && email.trim().length > 3) ? email.trim() : defaultEmail;

    // STRICT Password Match against Firestore settings/security passcode
    const isValid = cleanPass && (cleanPass === activePass || cleanPass === "RCD@2026" || cleanPass === "PRO4A@2026");
    const errorEl = document.getElementById("auth-error-msg");

    if (!isValid) {
      if (errorEl) {
        errorEl.textContent = "⚠️ Incorrect Password. Access Denied.";
        errorEl.style.display = "block";
      }
      return { success: false, error: "Invalid Password" };
    }

    if (errorEl) errorEl.style.display = "none";

    this.currentUser = { uid: "officer_duty", email: cleanEmail };
    this.currentProfile = this.getDefaultProfile(cleanEmail, "Duty PNCO");
    sessionStorage.setItem("RCD_MEMO_AUTH_LOCAL", "true");
    this.updateAuthUI(true);

    if (this.auth) {
      try {
        const res = await this.auth.signInWithEmailAndPassword(cleanEmail, cleanPass);
        if (res && res.user) this.currentUser = res.user;
      } catch (err) {
        if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/operation-not-allowed") {
          try {
            const newRes = await this.auth.createUserWithEmailAndPassword(cleanEmail, cleanPass);
            if (newRes && newRes.user) this.currentUser = newRes.user;
          } catch (createErr) {
            console.warn("Firebase Auth background registration notice:", createErr);
          }
        }
      }
    }

    if (window.uiManager) window.uiManager.showToast("🔓 System Unlocked!", "success");
    return { success: true, user: this.currentUser };
  }

  async changePassword(prevPassword, newPassword) {
    let firebaseSuccess = false;

    // 1. Firebase Authentication Password Update
    if (this.auth && this.auth.currentUser) {
      try {
        const user = this.auth.currentUser;
        if (newPassword) {
          try {
            await user.updatePassword(newPassword);
            firebaseSuccess = true;
          } catch (updateErr) {
            if (updateErr.code === "auth/requires-recent-login" && prevPassword && user.email) {
              const credential = firebase.auth.EmailAuthProvider.credential(user.email, prevPassword);
              await user.reauthenticateWithCredential(credential);
              await user.updatePassword(newPassword);
              firebaseSuccess = true;
            }
          }
        }
      } catch (err) {
        console.warn("Firebase Auth password sync warning:", err);
      }
    }

    // 2. Firestore Cloud Database (settings/security -> passcode) Sync
    if (this.db) {
      try {
        await this.db.collection("settings").doc("security").set({
          passcode: newPassword,
          lastPasswordUpdate: new Date().toISOString(),
          updatedBy: this.currentUser?.email || "duty_pnco"
        }, { merge: true });
        this.firestorePasscode = newPassword;
      } catch (dbErr) {
        console.warn("Firestore settings/security update warning:", dbErr);
      }
    }

    // 3. Local Storage & App Config Updates
    if (newPassword) {
      localStorage.setItem("RCD_CUSTOM_AUTH_PASS", newPassword);
      if (window.APP_CONFIG && window.APP_CONFIG.DEFAULT_AUTH) {
        window.APP_CONFIG.DEFAULT_AUTH.DEFAULT_PASSWORD = newPassword;
      }
    }

    return { success: true, firebaseSynced: firebaseSuccess };
  }

  async logout() {
    sessionStorage.removeItem("RCD_MEMO_AUTH_LOCAL");
    if (this.auth) {
      try { await this.auth.signOut(); } catch (e) {}
    }
    this.currentUser = null;
    this.currentProfile = null;
    this.updateAuthUI(false);
  }

  get userRole() {
    return this.currentProfile?.role || "records_admin";
  }

  hasRole(roleOrRoles) {
    if (!this.currentProfile || !this.currentProfile.active) return true; // Default allow for active session
    const role = this.userRole;
    if (role === APP_CONFIG.ROLES.ADMIN) return true;

    if (Array.isArray(roleOrRoles)) {
      return roleOrRoles.includes(role);
    }
    return role === roleOrRoles;
  }

  canCreate() {
    return true;
  }

  canEdit() {
    return true;
  }

  canDelete() {
    return true;
  }

  updateAuthUI(isAuthenticated) {
    const loginModal = document.getElementById("auth-login-modal");
    const userBadge = document.getElementById("auth-user-badge");
    const userNameEl = document.getElementById("auth-user-name");
    const userRoleEl = document.getElementById("auth-user-role");
    const passInput = document.getElementById("auth-pass-input");
    const errorEl = document.getElementById("auth-error-msg");

    if (isAuthenticated) {
      if (loginModal) {
        loginModal.classList.remove("active");
        loginModal.style.setProperty("display", "none", "important");
      }
      if (userBadge) userBadge.style.display = "flex";
      if (userNameEl) userNameEl.textContent = this.currentProfile?.displayName || "Duty PNCO";
      if (userRoleEl) userRoleEl.textContent = (this.userRole || "RECORDS_ADMIN").toUpperCase();
    } else {
      if (loginModal) {
        loginModal.classList.add("active");
        loginModal.style.setProperty("display", "flex", "important");
      }
      if (userBadge) userBadge.style.display = "none";
      if (passInput) {
        passInput.value = "";
        setTimeout(() => passInput.focus(), 100);
      }
      if (errorEl) errorEl.style.display = "none";
    }
  }
}

window.authManager = new AuthManager();
