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
  // Fill the values from Firebase Console > Project settings > Your apps > Web app.
  // The target project for this cloud deployment is: rcd-system
  FIREBASE: {
    apiKey: "REPLACE_WITH_RCD_SYSTEM_API_KEY",
    authDomain: "rcd-system.firebaseapp.com",
    projectId: "rcd-system",
    storageBucket: "REPLACE_WITH_RCD_SYSTEM_STORAGE_BUCKET",
    messagingSenderId: "REPLACE_WITH_RCD_SYSTEM_MESSAGING_SENDER_ID",
    appId: "REPLACE_WITH_RCD_SYSTEM_APP_ID"
  },

  // Google Integration Endpoints
  GOOGLE_DRIVE_FOLDER: "https://drive.google.com/drive/folders/1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh?usp=sharing",
  GOOGLE_SHEET_RCD_CONTROL: "https://docs.google.com/spreadsheets/d/18GuL5EwafykdUrTBmQKBdQfMIv1BDtios5K-xHjTG1k/edit?gid=2125212604#gid=2125212604",
  GOOGLE_SHEET_RCD_CSV: "https://docs.google.com/spreadsheets/d/18GuL5EwafykdUrTBmQKBdQfMIv1BDtios5K-xHjTG1k/gviz/tq?tqx=out:csv&gid=2125212604",
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxpRqR02DdjkHG07lSxfofyjXsvO-rnfYAv_InZl5GvmcqWzwmgW-F-lVVWP5ZNzh-J8g/exec",

  // Cloudflare Pages & Worker Integration
  CLOUDFLARE: {
    ENABLED: true,
    HEALTH_ENDPOINT: "/api/health"
  },

  // Default Officer & Admin Credentials
  DEFAULT_AUTH: {
    DEFAULT_EMAIL: "duty.pnco@pro4a.pnp.gov.ph",
    ADMIN_EMAIL: "admin@pro4a.pnp.gov.ph"
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
