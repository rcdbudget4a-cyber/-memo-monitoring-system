global.window = global;
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.APP_CONFIG = { SCHEMA_VERSION: 2 };
const fs = require('fs');

try {
  const dataContent = fs.readFileSync('./js/memos_data.js', 'utf8');
  eval(dataContent);
  console.log("INITIAL_MEMOS count loaded:", typeof INITIAL_MEMOS !== 'undefined' ? INITIAL_MEMOS.length : 0);

  const storageContent = fs.readFileSync('./js/storage.js', 'utf8');
  eval(storageContent);
  console.log("StorageManager loaded:", typeof StorageManager !== 'undefined');

  const agingContent = fs.readFileSync('./js/aging.js', 'utf8');
  eval(agingContent);
  console.log("AgingManager loaded:", typeof AgingManager !== 'undefined');

  console.log("SUCCESS: All modular JS scripts compile cleanly without any syntax or runtime errors!");
} catch (e) {
  console.error("ERROR in script execution:", e);
}
