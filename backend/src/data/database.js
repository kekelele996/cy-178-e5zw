const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { DB } = require('../config/constants');

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
    receiver_id INTEGER,
    parent_id INTEGER,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    forward_count INTEGER NOT NULL DEFAULT 0,
    previous_receiver_id INTEGER,
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
  CREATE INDEX IF NOT EXISTS idx_letters_expiry
    ON letters(status, expires_at);
`);

// 迁移：为已存在的旧版 letters 表补齐限时转投字段，并让 receiver_id 可空
const lettersColumns = db.prepare('PRAGMA table_info(letters)').all();
if (lettersColumns.some((c) => c.name === 'receiver_id' && c.notnull)) {
  // foreign_keys 在事务内开关是 no-op，必须在事务外关闭，重建期间不会触发级联
  db.pragma('foreign_keys = OFF');
  db.exec(`
    BEGIN;
    CREATE TABLE letters_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER,
      parent_id INTEGER,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      forward_count INTEGER NOT NULL DEFAULT 0,
      previous_receiver_id INTEGER,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES letters(id)
    );
    INSERT INTO letters_new
      (id, sender_id, receiver_id, parent_id, content, status, created_at)
      SELECT id, sender_id, receiver_id, parent_id, content, status, created_at
      FROM letters;
    DROP TABLE letters;
    ALTER TABLE letters_new RENAME TO letters;
    CREATE INDEX idx_letters_sender ON letters(sender_id);
    CREATE INDEX idx_letters_receiver ON letters(receiver_id);
    CREATE INDEX idx_letters_parent ON letters(parent_id);
    CREATE INDEX idx_letters_expiry ON letters(status, expires_at);
    COMMIT;
  `);
  db.pragma('foreign_keys = ON');
}

module.exports = db;
