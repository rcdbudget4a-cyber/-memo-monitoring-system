/**
 * Password-only access module
 * RCD Memorandum Monitoring System (PRO 4A)
 *
 * Default passcode: PRO4A2026
 * This provides a simple shared lock for the static GitHub Pages version.
 */

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.currentProfile = null;
    this.onAuthChangeCallbacks = [];
    this.sessionKey = "RCD_MEMO_AUTH_LOCAL";
    this.passcodeKey = "RCD_CUSTOM_PASSCODE";
    this.defaultPasscode = "PRO4A2026";
  }

  init() {
    const isAuthenticated = sessionStorage.getItem(this.sessionKey) === "true";

    if (isAuthenticated) {
      this.setAuthorizedSession();
      this.updateAuthUI(true);
    } else {
      this.currentUser = null;
      this.currentProfile = null;
      this.updateAuthUI(false);
    }

    this.notifyAuthChange();
  }

  onAuthStateChanged(callback) {
    if (typeof callback === "function") {
      this.onAuthChangeCallbacks.push(callback);
    }
  }

  getActivePasscode() {
    return localStorage.getItem(this.passcodeKey) || this.defaultPasscode;
  }

  setAuthorizedSession() {
    this.currentUser = {
      uid: "local_rcd_authorized_user",
      email: ""
    };

    this.currentProfile = {
      displayName: "Authorized RCD Personnel",
      email: "",
      role: "records_admin",
      section: "RCD",
      active: true
    };
  }

  login(passcode) {
    const enteredPasscode = String(passcode || "").trim();
    const errorEl = document.getElementById("auth-error-msg");

    if (errorEl) {
      errorEl.style.display = "none";
      errorEl.textContent = "";
    }

    if (!enteredPasscode) {
      this.showLoginError("Please enter the security passcode.");
      return false;
    }

    if (enteredPasscode !== this.getActivePasscode()) {
      this.showLoginError("Incorrect security passcode.");
      const input = document.getElementById("auth-pass-input");
      if (input) {
        input.value = "";
        input.focus();
      }
      return false;
    }

    sessionStorage.setItem(this.sessionKey, "true");
    this.setAuthorizedSession();
    this.updateAuthUI(true);
    this.notifyAuthChange();
    return true;
  }

  logout() {
    sessionStorage.removeItem(this.sessionKey);
    this.currentUser = null;
    this.currentProfile = null;
    this.updateAuthUI(false);
    this.notifyAuthChange();

    const input = document.getElementById("auth-pass-input");
    if (input) {
      input.value = "";
      setTimeout(() => input.focus(), 50);
    }
  }

  showLoginError(message) {
    const errorEl = document.getElementById("auth-error-msg");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = "block";
    }
  }

  notifyAuthChange() {
    this.onAuthChangeCallbacks.forEach((callback) => {
      try {
        callback(this.currentUser, this.currentProfile);
      } catch (error) {
        console.error("Authentication callback error:", error);
      }
    });
  }

  get userRole() {
    return this.currentProfile?.role || "records_admin";
  }

  hasRole(roleOrRoles) {
    if (!this.currentProfile || !this.currentProfile.active) return false;
    if (this.userRole === "admin") return true;
    return Array.isArray(roleOrRoles)
      ? roleOrRoles.includes(this.userRole)
      : this.userRole === roleOrRoles;
  }

  canCreate() {
    return Boolean(this.currentProfile?.active);
  }

  canEdit() {
    return Boolean(this.currentProfile?.active);
  }

  canDelete() {
    return Boolean(this.currentProfile?.active);
  }

  updateAuthUI(isAuthenticated) {
    const loginModal = document.getElementById("auth-login-modal");
    const userBadge = document.getElementById("auth-user-badge");
    const userNameEl = document.getElementById("auth-user-name");
    const userRoleEl = document.getElementById("auth-user-role");

    if (isAuthenticated) {
      if (loginModal) {
        loginModal.classList.remove("active");
        loginModal.style.setProperty("display", "none", "important");
      }
      if (userBadge) userBadge.style.display = "flex";
      if (userNameEl) userNameEl.textContent = this.currentProfile?.displayName || "Authorized RCD Personnel";
      if (userRoleEl) userRoleEl.textContent = "AUTHORIZED";
    } else {
      if (loginModal) {
        loginModal.classList.add("active");
        loginModal.style.setProperty("display", "flex", "important");
      }
      if (userBadge) userBadge.style.display = "none";
    }
  }
}

window.authManager = new AuthManager();
