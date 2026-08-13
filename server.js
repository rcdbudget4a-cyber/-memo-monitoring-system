const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/18GuL5EwafykdUrTBmQKBdQfMIv1BDtios5K-xHjTG1k/gviz/tq?tqx=out:csv&gid=2125212604";

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

const DB_FILE = path.join(__dirname, 'data', 'memos_db.json');
const DELETED_FILE = path.join(__dirname, 'data', 'deleted_memos.json');

function getServerIp() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) {
        return entry.address;
      }
    }
  }
  return '127.0.0.1';
}

function initCentralDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    try {
      const memosDataJs = fs.readFileSync(path.join(__dirname, 'js', 'memos_data.js'), 'utf8');
      const match = memosDataJs.match(/const INITIAL_MEMOS = ([\s\S]*?);\s*\nif/);
      if (match) {
        const initialMemos = JSON.parse(match[1]);
        const dataDir = path.dirname(DB_FILE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(DB_FILE, JSON.stringify(initialMemos, null, 2), 'utf8');
        console.log(`[Central DB] Initialized data/memos_db.json with ${initialMemos.length} records.`);
      }
    } catch (e) {
      console.error("[Central DB] Init error:", e);
    }
  }
}

initCentralDatabase();

function readDeletedDb() {
  try {
    if (fs.existsSync(DELETED_FILE)) {
      const arr = JSON.parse(fs.readFileSync(DELETED_FILE, 'utf8'));
      return new Set(arr);
    }
  } catch (e) {
    console.error("[Deleted DB] Read error:", e);
  }
  return new Set();
}

function writeDeletedDb(deletedSet) {
  try {
    const dataDir = path.dirname(DELETED_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(DELETED_FILE, JSON.stringify(Array.from(deletedSet)), 'utf8');
  } catch (e) {
    console.error("[Deleted DB] Write error:", e);
  }
}

function readCentralDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const memos = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      const deletedSet = readDeletedDb();
      if (deletedSet.size > 0) {
        return memos.filter(m => m && m.id && !deletedSet.has(String(m.id).trim().toUpperCase()));
      }
      return memos;
    }
  } catch (e) {
    console.error("[Central DB] Read error:", e);
  }
  return [];
}

function writeCentralDb(memos) {
  try {
    const dataDir = path.dirname(DB_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(memos, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error("[Central DB] Write error:", e);
    return false;
  }
}

function getBaseId(id) {
  if (!id) return "";
  const parts = String(id).trim().toUpperCase().split('-');
  if (parts.length > 3) {
    return parts.slice(0, 3).join('-');
  }
  return parts.join('-');
}

function deleteFromCentralDb(idsToDelete) {
  const currentMemos = readCentralDb();
  const deletedSet = readDeletedDb();

  idsToDelete.forEach(id => {
    if (id) {
      const clean = String(id).trim().toUpperCase();
      deletedSet.add(clean);
      const base = getBaseId(clean);
      if (base) deletedSet.add(base);
    }
  });

  writeDeletedDb(deletedSet);

  const filtered = currentMemos.filter(m => {
    if (!m || !m.id) return false;
    const k = String(m.id).trim().toUpperCase();
    const base = getBaseId(k);
    return !deletedSet.has(k) && !deletedSet.has(base);
  });

  writeCentralDb(filtered);
  console.log(`[Central DB] Permanently deleted ${idsToDelete.length} records. Total remaining: ${filtered.length}`);
  return filtered;
}

function syncFromGoogleSheet(callback) {
  https.get(SHEET_CSV_URL, (res) => {
    let rawData = '';
    res.on('data', chunk => rawData += chunk);
    res.on('end', () => {
      try {
        const lines = [];
        let currentLine = '';
        let insideQuote = false;

        for (let i = 0; i < rawData.length; i++) {
          const char = rawData[i];
          if (char === '"') {
            insideQuote = !insideQuote;
            currentLine += char;
          } else if (char === '\n' && !insideQuote) {
            lines.push(currentLine);
            currentLine = '';
          } else {
            currentLine += char;
          }
        }
        if (currentLine) lines.push(currentLine);

        const formattedMemos = [];
        const seenIds = new Set();

        lines.forEach((line, idx) => {
          if (!line.trim() || idx === 0) return;

          const matches = line.match(/"([^"]*)"/g);
          if (!matches || matches.length < 10) return;

          const cols = matches.map(m => m.replace(/^"|"$/g, '').replace(/""/g, '"').trim());

          let memoId = cols[1];
          if (!memoId || memoId === "Control Ref ID") return;
          seenIds.add(memoId);

          const dateLogged = cols[2] || "8/4/2026";
          const time = cols[3] || "8:00:00 AM";
          const receivedBy = cols[4] || "Duty PNCO";
          const originatingOffice = cols[5] || "ROD";
          const subject = cols[6] || "Untitled Memorandum";
          const actionRequired = cols[7] || "For Info";
          const remarksStatus = cols[8] || "Received";
          const transmittedOffice = (cols[9] && cols[9] !== "Pending Release") ? cols[9] : "";
          const dateReceived = cols[10] || dateLogged;
          const driveLink = cols[12] || "";

          let computedWorkflowStatus = "RECEIVED";
          if (remarksStatus === "Transmitted to" || (transmittedOffice && transmittedOffice.length > 2)) {
            computedWorkflowStatus = "TRANSMITTED";
          } else if (remarksStatus.includes("Concur") || remarksStatus.includes("Approved") || remarksStatus.includes("Signed")) {
            computedWorkflowStatus = "APPROVED";
          }

          formattedMemos.push({
            id: memoId,
            dateLogged: dateLogged,
            time: time,
            receivedBy: receivedBy,
            originatingOffice: originatingOffice,
            subject: subject,
            actionRequired: actionRequired,
            remarksStatus: remarksStatus,
            transmittedOffice: transmittedOffice,
            dateReceived: dateReceived,
            driveLink: driveLink,
            pages: 1,
            memoType: memoId.toUpperCase().startsWith("ORCD") ? "OUTGOING" : "INCOMING",
            workflowStatus: computedWorkflowStatus,
            priority: "NORMAL",
            assignedSection: "RCD",
            schemaVersion: 2,
            isDeleted: false
          });
        });

        if (formattedMemos.length > 0) {
          const deletedSet = readDeletedDb();
          const currentMemos = readCentralDb();
          const currentMap = new Map();
          currentMemos.forEach(m => {
            if (m && m.id) currentMap.set(String(m.id).trim().toUpperCase(), m);
          });

          const memoMap = new Map();

          formattedMemos.forEach(m => {
            if (m && m.id) {
              const k = String(m.id).trim().toUpperCase();
              const baseK = getBaseId(k);
              if (!deletedSet.has(k) && (!baseK || !deletedSet.has(baseK))) {
                const existing = currentMap.get(k);
                if (existing) {
                  memoMap.set(k, {
                    ...m,
                    driveLink: m.driveLink || existing.driveLink || "",
                    fileData: existing.fileData || m.fileData || "",
                    fileName: existing.fileName || m.fileName || ""
                  });
                } else {
                  memoMap.set(k, m);
                }
              }
            }
          });

          currentMemos.forEach(m => {
            if (m && m.id) {
              const k = String(m.id).trim().toUpperCase();
              const baseK = getBaseId(k);
              if (!memoMap.has(k) && !deletedSet.has(k) && (!baseK || !deletedSet.has(baseK))) {
                memoMap.set(k, m);
              }
            }
          });

          const merged = Array.from(memoMap.values());
          writeCentralDb(merged);
          console.log(`[Google Sheet Auto-Sync] Synced ${formattedMemos.length} rows from Google Sheet into DB (Total: ${merged.length}).`);
          if (callback) callback(null, merged);
        } else {
          if (callback) callback(null, readCentralDb());
        }
      } catch (err) {
        console.error("[Google Sheet Auto-Sync] Parse error:", err);
        if (callback) callback(err);
      }
    });
  }).on('error', (e) => {
    console.error("[Google Sheet Auto-Sync] Network error:", e.message);
    if (callback) callback(e);
  });
}

// Run Google Sheet sync on start and every 30 seconds
syncFromGoogleSheet();
setInterval(syncFromGoogleSheet, 30000);

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  if (reqPath === '/api/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      status: 'online',
      serverIp: getServerIp(),
      port: Number(PORT),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  if (reqPath === '/api/sync-sheet') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    syncFromGoogleSheet((err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, count: data ? data.length : 0 }));
      }
    });
    return;
  }

  if (reqPath === '/api/memos') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      const memos = readCentralDb();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(JSON.stringify(memos));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const currentMemos = readCentralDb();
          const memoMap = new Map();

          const incomingList = Array.isArray(payload) ? payload : [payload];
          incomingList.forEach(m => {
            if (m && m.id) {
              const k = String(m.id).trim().toUpperCase();
              memoMap.set(k, m);
            }
          });

          currentMemos.forEach(m => {
            if (m && m.id) {
              const k = String(m.id).trim().toUpperCase();
              if (!memoMap.has(k)) {
                memoMap.set(k, m);
              }
            }
          });

          const updatedList = Array.from(memoMap.values());
          writeCentralDb(updatedList);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, count: updatedList.length }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (req.method === 'DELETE') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          let idsToDelete = [];
          const pathParts = reqPath.split('/');
          if (pathParts.length >= 4 && pathParts[3]) {
            idsToDelete.push(decodeURIComponent(pathParts[3]).trim().toUpperCase());
          }
          if (body) {
            try {
              const parsed = JSON.parse(body);
              if (Array.isArray(parsed.ids)) {
                parsed.ids.forEach(id => idsToDelete.push(String(id).trim().toUpperCase()));
              } else if (parsed.id) {
                idsToDelete.push(String(parsed.id).trim().toUpperCase());
              }
            } catch (e) {}
          }

          if (idsToDelete.length > 0) {
            deleteFromCentralDb(idsToDelete);
          }

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, count: idsToDelete.length }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }

  if (reqPath.startsWith('/api/memos/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'DELETE') {
      const pathParts = reqPath.split('/');
      const memoId = pathParts[pathParts.length - 1];
      if (memoId) {
        deleteFromCentralDb([decodeURIComponent(memoId)]);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, deleted: memoId }));
      return;
    }
  }

  if (reqPath === '/') reqPath = '/index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`  PNP PRO 4A - RCD MEMO MONITORING SYSTEM (LOCAL LAN)`);
  console.log(`======================================================`);
  console.log(`  Local Computer URL:    http://localhost:${PORT}`);
  console.log(`  Detected Server URL:   http://${getServerIp()}:${PORT}`);

  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  Office LAN Network URL: http://${net.address}:${PORT}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Network adapter scan:  unavailable (${error.code || 'unknown error'})`);
  }
  console.log(`======================================================\n`);
});
