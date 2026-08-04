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

    // Firebase Auth State Listener
    this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        const profile = await this.fetchUserProfile(user.uid);
        if (profile && profile.active === true) {
          this.currentUser = user;
          this.currentProfile = profile;
          this.updateAuthUI(true);
        } else {
          console.warn("User authenticated in Firebase Auth, but missing active Firestore user profile:", user.uid);
          await this.auth.signOut();
          this.currentUser = null;
          this.currentProfile = null;
          this.updateAuthUI(false, "Access Denied: Account lacks an active Firestore user profile. Contact system administrator.");
        }
      } else {
        this.currentUser = null;
        this.currentProfile = null;
        this.updateAuthUI(false);
      }

      this.notifyAuthListeners();
    });
  }

  onAuthStateChanged(callback) {
    if (typeof callback === "function") {
      this.onAuthChangeCallbacks.push(callback);
      // Immediately invoke if user is already authenticated
      if (this.currentUser && this.currentProfile) {
        try { callback(this.currentUser, this.currentProfile); } catch (e) { console.error("Auth callback err:", e); }
      }
    }
  }

  notifyAuthListeners() {
    this.onAuthChangeCallbacks.forEach(cb => {
      try { cb(this.currentUser, this.currentProfile); } catch (e) { console.error("Auth callback err:", e); }
    });
  }

  async fetchUserProfile(uid) {
    if (!this.db || !uid) return null;
    try {
      const docRef = this.db.collection("users").doc(uid);
      const doc = await docRef.get();
      if (doc.exists) {
        return doc.data();
      } else {
        return null;
      }
    } catch (e) {
      console.error("Error fetching user profile from Firestore:", e);
      return null;
    }
  }

  async login(email, password) {
    const cleanEmail = email ? email.trim() : "";
    const cleanPass = password ? password.trim() : "";

    const errorEl = document.getElementById("auth-error-msg");
    const setError = (msg) => {
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = "block";
      }
      if (window.uiManager) window.uiManager.showToast(msg, "error");
    };

    if (!cleanEmail || !cleanPass) {
      setError("⚠️ Email and password are required.");
      return { success: false, error: "Email and password required" };
    }

    if (!this.auth) {
      setError("⚠️ Authentication service unavailable.");
      return { success: false, error: "Auth service null" };
    }

    if (errorEl) errorEl.style.display = "none";

    try {
      const res = await this.auth.signInWithEmailAndPassword(cleanEmail, cleanPass);
      if (!res || !res.user) {
        setError("⚠️ Login failed. Please check credentials.");
        return { success: false, error: "No user returned" };
      }

      // Check Firestore User Profile
      const profile = await this.fetchUserProfile(res.user.uid);
      if (!profile || profile.active !== true) {
        await this.auth.signOut();
        setError("⚠️ Access Denied: Authorized user profile not found or inactive in Firestore.");
        return { success: false, error: "Missing or inactive profile" };
      }

      this.currentUser = res.user;
      this.currentProfile = profile;
      this.updateAuthUI(true);
      if (window.uiManager) window.uiManager.showToast(`🔓 Welcome back, ${profile.displayName || cleanEmail}!`, "success");
      return { success: true, user: res.user, profile: profile };

    } catch (err) {
      console.error("Firebase Login Error:", err);
      let userMsg = "⚠️ Authentication failed: " + (err.message || "Unknown error");
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        userMsg = "⚠️ Invalid Email or Password.";
      } else if (err.code === "auth/user-disabled") {
        userMsg = "⚠️ This user account has been disabled.";
      } else if (err.code === "auth/too-many-requests") {
        userMsg = "⚠️ Too many failed login attempts. Please wait a moment and try again.";
      }
      setError(userMsg);
      return { success: false, error: userMsg };
    }
  }

  async changePassword(prevPassword, newPassword) {
    if (!this.auth || !this.auth.currentUser) {
      return { success: false, error: "No authenticated user." };
    }

    try {
      const user = this.auth.currentUser;
      if (!newPassword || newPassword.length < 6) {
        return { success: false, error: "Password must be at least 6 characters." };
      }

      try {
        await user.updatePassword(newPassword);
      } catch (updateErr) {
        if (updateErr.code === "auth/requires-recent-login" && prevPassword && user.email) {
          const credential = firebase.auth.EmailAuthProvider.credential(user.email, prevPassword);
          await user.reauthenticateWithCredential(credential);
          await user.updatePassword(newPassword);
        } else {
          throw updateErr;
        }
      }

      return { success: true };
    } catch (err) {
      console.error("Password update error:", err);
      return { success: false, error: err.message || "Could not update password." };
    }
  }

  async logout() {
    if (this.auth) {
      try { await this.auth.signOut(); } catch (e) { console.warn("SignOut error:", e); }
    }
    this.currentUser = null;
    this.currentProfile = null;
    this.updateAuthUI(false);
    this.notifyAuthListeners();
    if (window.uiManager) window.uiManager.showToast("🚪 Signed out successfully.", "info");
  }

  get userRole() {
    return this.currentProfile?.role || "viewer";
  }

  hasRole(roleOrRoles) {
    if (!this.currentProfile || !this.currentProfile.active) return false;
    const role = this.userRole;
    if (role === APP_CONFIG.ROLES.ADMIN) return true;

    if (Array.isArray(roleOrRoles)) {
      return roleOrRoles.includes(role);
    }
    return role === roleOrRoles;
  }

  canCreate() {
    return this.hasRole([APP_CONFIG.ROLES.ADMIN, APP_CONFIG.ROLES.RECORDS_ADMIN, APP_CONFIG.ROLES.DUTY_PNCO, APP_CONFIG.ROLES.ACTION_OFFICER]);
  }

  canEdit() {
    return this.hasRole([APP_CONFIG.ROLES.ADMIN, APP_CONFIG.ROLES.RECORDS_ADMIN, APP_CONFIG.ROLES.DUTY_PNCO, APP_CONFIG.ROLES.ACTION_OFFICER, APP_CONFIG.ROLES.APPROVER]);
  }

  canDelete() {
    return this.hasRole(APP_CONFIG.ROLES.ADMIN);
  }

  updateAuthUI(isAuthenticated, errorMessage = "") {
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
      if (userNameEl) userNameEl.textContent = this.currentProfile?.displayName || this.currentUser?.email || "Authorized User";
      if (userRoleEl) userRoleEl.textContent = (this.userRole || "USER").toUpperCase();
    } else {
      if (loginModal) {
        loginModal.classList.add("active");
        loginModal.style.setProperty("display", "flex", "important");
      }
      if (userBadge) userBadge.style.display = "none";
      if (passInput) passInput.value = "";
      if (errorEl) {
        if (errorMessage) {
          errorEl.textContent = errorMessage;
          errorEl.style.display = "block";
        } else {
          errorEl.style.display = "none";
        }
      }
    }
  }
}

window.authManager = new AuthManager();
