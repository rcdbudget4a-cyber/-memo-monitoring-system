/**
 * Central Configuration Module
 * RCD Memorandum Monitoring System (PRO 4A)
 *
 * Firebase Web SDK configuration is a public client identifier.
 * Access to memorandum records is protected by Firebase Authentication
 * and Firestore Security Rules.
 */

const APP_CONFIG = {
  SYSTEM_TITLE: "RCD Incoming/Outgoing Memorandum Monitoring System",
  AGENCY_FULL: "PHILIPPINE NATIONAL POLICE • POLICE REGIONAL OFFICE 4A",
  DIVISION_NAME: "OFFICE OF THE REGIONAL COMPTROLLERSHIP DIVISION",
  SCHEMA_VERSION: 2,

  FIREBASE: {
    apiKey: "AIzaSyC04xaukwxDG9-Hn8B1vwZVuaQrvb9zH1k",
    authDomain: "incoming-outgoing-memo.firebaseapp.com",
    projectId: "incoming-outgoing-memo",
    storageBucket: "incoming-outgoing-memo.firebasestorage.app",
    messagingSenderId: "985454161101",
    appId: "1:985454161101:web:95da4973e0cc72b574cd84",
    measurementId: "G-34W97S6RBW"
  },

  GOOGLE_DRIVE_FOLDER: "https://drive.google.com/drive/folders/1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh?usp=sharing",
  GOOGLE_SHEET_RCD_CONTROL: "https://docs.google.com/spreadsheets/d/18GuL5EwafykdUrTBmQKBdQfMIv1BDtios5K-xHjTG1k/edit?gid=2125212604#gid=2125212604",
  GOOGLE_SHEET_RCD_CSV: "https://docs.google.com/spreadsheets/d/18GuL5EwafykdUrTBmQKBdQfMIv1BDtios5K-xHjTG1k/gviz/tq?tqx=out:csv&gid=2125212604",
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxpRqR02DdjkHG07lSxfofyjXsvO-rnfYAv_InZl5GvmcqWzwmgW-F-lVVWP5ZNzh-J8g/exec",

  CLOUDFLARE: {
    ENABLED: true,
    HEALTH_ENDPOINT: "/api/health"
  },

  DEFAULT_AUTH: {
    DEFAULT_EMAIL: "rcdbudget4a@gmail.com",
    ADMIN_EMAIL: "rcdbudget4a@gmail.com"
  },

  ROLES: {
    ADMIN: "admin",
    RECORDS_ADMIN: "records_admin",
    DUTY_PNCO: "duty_pnco",
    ACTION_OFFICER: "action_officer",
    APPROVER: "approver",
    VIEWER: "viewer"
  }
};

window.APP_CONFIG = APP_CONFIG;
