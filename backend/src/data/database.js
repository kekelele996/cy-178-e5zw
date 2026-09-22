const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { DB, LETTER_STATUS, REROUTE } = require('../config/constants');

const dbFile = path.isAbsolute(DB.FILE) ? DB.FILE : path.join(__dirname, '..', '..', DB.FILE);
const dataDir = path.dirname(dbFile);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pen_name TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    parent_id INTEGER,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL DEFAULT 0,
    reroute_count INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES letters(id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    letter_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, letter_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_letters_sender ON letters(sender_id);
  CREATE INDEX IF NOT EXISTS idx_letters_receiver ON letters(receiver_id);
  CREATE INDEX IF NOT EXISTS idx_letters_parent ON letters(parent_id);
  CREATE INDEX IF NOT EXISTS idx_letters_status ON letters(status);
`);

// Migration for databases created before the time-limited re-routing feature.
const letterColumns = db.prepare('PRAGMA table_info(letters)').all();
const has = (name) => letterColumns.some((c) => c.name === name);
db.transaction(() => {
  if (!has('expires_at')) {
    db.exec('ALTER TABLE letters ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0');
  }
  if (!has('reroute_count')) {
    db.exec('ALTER TABLE letters ADD COLUMN reroute_count INTEGER NOT NULL DEFAULT 0');
  }
  if (!has('version')) {
    db.exec('ALTER TABLE letters ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  }
  // Letters that were still awaiting a reply when the feature landed are now
  // also subject to the 72h window; terminal states keep expires_at = 0.
  db.prepare(
    `UPDATE letters
        SET expires_at = ?
      WHERE expires_at = 0
        AND parent_id IS NULL
        AND status IN (?, ?)`
  ).run(
    Date.now() + REROUTE.WINDOW_MS,
    LETTER_STATUS.DELIVERED,
    LETTER_STATUS.PENDING
  );
})();

module.exports = db;
