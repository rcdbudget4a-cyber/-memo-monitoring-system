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

    this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        this.currentUser = user;
        this.currentProfile = await this.fetchUserProfile(user.uid, user.email, user.displayName);
        this.updateAuthUI(true);
      } else {
        this.currentUser = null;
        this.currentProfile = null;
        this.updateAuthUI(false);
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
        // Automatically register initial user profile (Default role: admin if initial admin email, else viewer)
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
    return {
      displayName: displayName || (email ? email.split("@")[0].toUpperCase() : "Authorized Officer"),
      email: email || "duty.pnco@pro4a.pnp.gov.ph",
      role: "records_admin",
      section: "RCD",
      active: true
    };
  }

  async login(email, password) {
    if (!this.auth) throw new Error("Firebase Auth is not initialized.");
    return await this.auth.signInWithEmailAndPassword(email, password);
  }

  async loginWithGoogle() {
    if (!this.auth) throw new Error("Firebase Auth is not initialized.");
    const provider = new firebase.auth.GoogleAuthProvider();
    return await this.auth.signInWithPopup(provider);
  }

  async logout() {
    if (this.auth) {
      await this.auth.signOut();
    }
  }

  get userRole() {
    return this.currentProfile?.role || "viewer";
  }

  hasRole(roleOrRoles) {
    if (!this.currentProfile || !this.currentProfile.active) return false;
    const role = this.userRole;
    if (role === APP_CONFIG.ROLES.ADMIN) return true; // Admin has full access

    if (Array.isArray(roleOrRoles)) {
      return roleOrRoles.includes(role);
    }
    return role === roleOrRoles;
  }

  canCreate() {
    return this.hasRole([
      APP_CONFIG.ROLES.ADMIN,
      APP_CONFIG.ROLES.RECORDS_ADMIN,
      APP_CONFIG.ROLES.DUTY_PNCO,
      APP_CONFIG.ROLES.ACTION_OFFICER
    ]);
  }

  canEdit() {
    return this.hasRole([
      APP_CONFIG.ROLES.ADMIN,
      APP_CONFIG.ROLES.RECORDS_ADMIN,
      APP_CONFIG.ROLES.DUTY_PNCO,
      APP_CONFIG.ROLES.ACTION_OFFICER,
      APP_CONFIG.ROLES.APPROVER
    ]);
  }

  canDelete() {
    return this.hasRole(APP_CONFIG.ROLES.ADMIN);
  }

  updateAuthUI(isAuthenticated) {
    const loginModal = document.getElementById("auth-login-modal");
    const userBadge = document.getElementById("auth-user-badge");
    const userNameEl = document.getElementById("auth-user-name");
    const userRoleEl = document.getElementById("auth-user-role");

    if (isAuthenticated && this.currentUser) {
      if (loginModal) loginModal.classList.remove("active");
      if (userBadge) userBadge.style.display = "flex";
      if (userNameEl) userNameEl.textContent = this.currentProfile?.displayName || this.currentUser.email;
      if (userRoleEl) userRoleEl.textContent = (this.userRole || "USER").toUpperCase();
    } else {
      if (loginModal) loginModal.classList.add("active");
      if (userBadge) userBadge.style.display = "none";
    }
  }
}

window.authManager = new AuthManager();
