const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('./config');
const { ensureDirectory } = require('./crypto');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT,
      file_name TEXT,
      saved_path TEXT,
      sender TEXT,
      media_type TEXT,
      message_date TEXT,
      status TEXT,
      error TEXT,
      attempt INTEGER DEFAULT 0,
      downloaded_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

function getAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

async function logDownload(entry) {
  const payload = [
    entry.messageId,
    entry.fileName,
    entry.savedPath,
    entry.sender,
    entry.mediaType,
    entry.messageDate,
    entry.status,
    entry.error || null,
    entry.attempt || 0
  ];
  await run(
    `INSERT INTO downloads (message_id, file_name, saved_path, sender, media_type, message_date, status, error, attempt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    payload
  );
}

async function markRetryableFailures(maxAttempt) {
  return getAll(
    `SELECT * FROM downloads WHERE status = 'failed' AND attempt < ? ORDER BY downloaded_at DESC`,
    [maxAttempt]
  );
}

module.exports = {
  db,
  getAll,
  logDownload,
  markRetryableFailures,
  run
};
