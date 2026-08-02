/**
 * Central Configuration Module
 * RCD Memorandum Monitoring System (PRO 4A)
 *
 * NOTE ON SECURITY ARCHITECTURE:
 * The Firebase configuration below contains public Web SDK keys required for client-side connection.
 * Web configuration keys are public identifiers and NOT secret passwords.
 * Database security and access authorization MUST be strictly enforced via:
 *   1. Firebase Authentication (User Email/Password login)
 *   2. Firestore Security Rules (enforced server-side in Firebase Console)
 */

const APP_CONFIG = {
  SYSTEM_TITLE: "RCD Incoming/Outgoing Memorandum Monitoring System",
  AGENCY_FULL: "PHILIPPINE NATIONAL POLICE • POLICE REGIONAL OFFICE 4A",
  DIVISION_NAME: "OFFICE OF THE REGIONAL COMPTROLLERSHIP DIVISION",
  SCHEMA_VERSION: 2,

  // Firebase Web App Configuration
  FIREBASE: {
    apiKey: "AIzaSyC04xaukwxDG9-Hn8B1vwZVuaQrvb9zH1k",
    authDomain: "incoming-outgoing-memo.firebaseapp.com",
    projectId: "incoming-outgoing-memo",
    storageBucket: "incoming-outgoing-memo.firebasestorage.app",
    messagingSenderId: "985454161101",
    appId: "1:985454161101:web:95da4973e0cc72b574cd84",
    measurementId: "G-34W97S6RBW"
  },

  // Google Integration Endpoints
  GOOGLE_DRIVE_FOLDER: "https://drive.google.com/drive/folders/1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh?usp=sharing",
  GOOGLE_SHEET_RCD_CONTROL: "https://docs.google.com/spreadsheets/d/166VH0J3B0kY9MBvP37x9NtV32Vsk_y0kDqfQrutRcxA/edit?gid=767216694#gid=767216694",
  GOOGLE_SHEET_RCD_CSV: "https://docs.google.com/spreadsheets/d/166VH0J3B0kY9MBvP37x9NtV32Vsk_y0kDqfQrutRcxA/gviz/tq?tqx=out:csv&gid=767216694",
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxvhr0U3IWOhOLYLdWZFSRL-Q8otNf4gTPSkBgsD82CrNPJ9xowvuMsUgFLSNAsvAPIUg/exec",

  // Cloudflare Pages & Worker Integration
  CLOUDFLARE: {
    ENABLED: true,
    HEALTH_ENDPOINT: "/api/health"
  },

  // Default Officer Credentials & Passcodes
  DEFAULT_AUTH: {
    DEFAULT_EMAIL: "duty.pnco@pro4a.pnp.gov.ph",
    DEFAULT_PASSWORD: "RCD@2026",
    VALID_PASSCODES: ["RCD@2026", "PRO4A@2026"]
  },

  // Supported User Roles & Permissions
  ROLES: {
    ADMIN: "admin",                // Full system administration & soft-delete restore
    RECORDS_ADMIN: "records_admin",// Manage, edit, assign, & transmit all records
    DUTY_PNCO: "duty_pnco",        // Log incoming/outgoing memos, print duty journal
    ACTION_OFFICER: "action_officer", // View, acknowledge, & update assigned action
    APPROVER: "approver",          // Review, concur, & approve memos
    VIEWER: "viewer"               // Read-only access to logged memos
  }
};

window.APP_CONFIG = APP_CONFIG;
