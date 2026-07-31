global.window = global;
global.document = {
  getElementById: (id) => ({ addEventListener: () => {}, innerHTML: '', value: 'ALL', style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ setAttribute: () => {}, addEventListener: () => {}, appendChild: () => {}, style: {}, classList: { add: () => {}, remove: () => {} } })
};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.APP_CONFIG = { SCHEMA_VERSION: 2, ROLES: { ADMIN: "admin" } };

const fs = require('fs');

const codeData = fs.readFileSync('./js/memos_data.js', 'utf8');
const codeStorage = fs.readFileSync('./js/storage.js', 'utf8');
const codeAging = fs.readFileSync('./js/aging.js', 'utf8');
const codeApp = fs.readFileSync('./js/app.js', 'utf8');

eval(codeData);
eval(codeStorage);
eval(codeAging);
eval(codeApp + "; global.MemoMonitoringApp = MemoMonitoringApp;");

const testApp = new MemoMonitoringApp();
console.log("MemoMonitoringApp successfully created!");
console.log("Active memos count in testApp:", testApp.memos.length);

if (testApp.memos.length === 1210) {
  console.log("SUCCESS: Exactly 1,210 memorandum records loaded!");
} else {
  console.error("FAILURE: Memos count mismatch!", testApp.memos.length);
}
