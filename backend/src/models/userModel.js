const db = require('../data/database');

const UserModel = {
  create({ penName, passwordHash, createdAt }) {
    const stmt = db.prepare(
      'INSERT INTO users (pen_name, password_hash, created_at) VALUES (?, ?, ?)'
    );
    const info = stmt.run(penName, passwordHash, createdAt);
    return info.lastInsertRowid;
  },

  findByPenName(penName) {
    return db.prepare('SELECT * FROM users WHERE pen_name = ?').get(penName);
  },

  findById(id) {
    return db.prepare('SELECT id, pen_name, created_at FROM users WHERE id = ?').get(id);
  },

  findRandomOther(id) {
    return db
      .prepare('SELECT id FROM users WHERE id != ? ORDER BY RANDOM() LIMIT 1')
      .get(id);
  },

  // 转投时随机选人：排除寄件人本人，也排除上一位收信人（不会回到旧收信人）
  findRandomOtherExcept(senderId, excludedIds = []) {
    const exclusions = [senderId, ...excludedIds.filter((x) => x != null)];
    const placeholders = exclusions.map(() => '?').join(', ');
    return db
      .prepare(
        `SELECT id FROM users WHERE id NOT IN (${placeholders})
         ORDER BY RANDOM() LIMIT 1`
      )
      .get(...exclusions);
  },

  countOthers(id) {
    const row = db.prepare('SELECT COUNT(*) AS c FROM users WHERE id != ?').get(id);
    return row.c;
  }
};

module.exports = UserModel;
