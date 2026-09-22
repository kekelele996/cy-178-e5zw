const db = require('../data/database');

const LETTER_COLUMNS = `l.id, l.sender_id, l.receiver_id, l.parent_id, l.content,
  l.status, l.created_at, l.expires_at, l.reroute_count, l.version`;

const LetterModel = {
  create({ senderId, receiverId, parentId, content, status, createdAt, expiresAt }) {
    const stmt = db.prepare(
      `INSERT INTO letters
        (sender_id, receiver_id, parent_id, content, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(
      senderId,
      receiverId,
      parentId || null,
      content,
      status,
      createdAt,
      expiresAt || 0
    );
    return info.lastInsertRowid;
  },

  findById(id) {
    return db.prepare('SELECT * FROM letters WHERE id = ?').get(id);
  },

  findRootByChild(id) {
    const row = db
      .prepare(
        `WITH RECURSIVE chain(id, parent_id) AS (
           SELECT id, parent_id FROM letters WHERE id = ?
           UNION ALL
           SELECT l.id, l.parent_id FROM letters l
           INNER JOIN chain c ON l.id = c.parent_id
         )
         SELECT id FROM chain WHERE parent_id IS NULL`
      )
      .get(id);
    return row ? row.id : id;
  },

  // Conditional, atomic status transition; returns whether a row was changed.
  // Guarding every state move on the expected status is what makes expiry,
  // reply, skip, reroute and withdraw mutually exclusive even when their
  // requests arrive at the same instant.
  transition({ id, fromStatuses, changes }) {
    const placeholders = fromStatuses.map(() => '?').join(', ');
    const columns = Object.keys(changes);
    const assignments = columns.map((column) => `${column} = ?`).join(', ');
    const stmt = db.prepare(
      `UPDATE letters
          SET ${assignments}, version = version + 1
        WHERE id = ? AND status IN (${placeholders})`
    );
    return stmt
      .run(...columns.map((column) => changes[column]), id, ...fromStatuses)
      .changes > 0;
  },

  updateContent(id, content) {
    return db.prepare('UPDATE letters SET content = ? WHERE id = ?').run(content, id);
  },

  // Move every timed-out root letter back to its sender in one sweep.
  listExpiredRoots(now) {
    return db
      .prepare(
        `SELECT * FROM letters
          WHERE parent_id IS NULL
            AND expires_at > 0
            AND expires_at <= ?
            AND status IN ('delivered', 'pending')`
      )
      .all(now);
  },

  // Remove favorites belonging to a receiver whose copy of the letter is gone.
  deleteReceiverFavorites({ letterId, receiverId }) {
    return db
      .prepare(
        'DELETE FROM favorites WHERE letter_id = ? AND user_id = ?'
      )
      .run(letterId, receiverId);
  },

  listPendingReroutes(senderId) {
    return db
      .prepare(
        `SELECT ${LETTER_COLUMNS},
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.sender_id = ?
           AND l.parent_id IS NULL
           AND l.status = 'returned'
         ORDER BY l.expires_at DESC`
      )
      .all(senderId);
  },

  listSentByUser(userId) {
    return db
      .prepare(
        `SELECT ${LETTER_COLUMNS},
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.sender_id = ? AND l.parent_id IS NULL
         ORDER BY l.created_at DESC`
      )
      .all(userId);
  },

  // Returned/rerouted/withdrawn letters must vanish from the old receiver's
  // inbox — the receiver column still holds history, but only live statuses
  // are visible.
  listReceivedByUser(userId) {
    return db
      .prepare(
        `SELECT ${LETTER_COLUMNS},
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.receiver_id = ?
           AND l.parent_id IS NULL
           AND l.status IN ('delivered', 'pending', 'replied')
         ORDER BY l.created_at DESC`
      )
      .all(userId);
  },

  listConversationsForUser(userId) {
    return db
      .prepare(
        `SELECT DISTINCT ${LETTER_COLUMNS},
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.parent_id IS NULL
           AND l.status = 'replied'
           AND (l.sender_id = ? OR l.receiver_id = ?)
           AND EXISTS (
             SELECT 1 FROM letters c WHERE c.parent_id = l.id
           )
         ORDER BY l.created_at DESC`
      )
      .all(userId, userId);
  },

  listThread(rootId) {
    return db
      .prepare(
        `WITH RECURSIVE chain(id, parent_id, depth) AS (
           SELECT id, parent_id, 0 FROM letters WHERE id = ?
           UNION ALL
           SELECT l.id, l.parent_id, c.depth + 1 FROM letters l
           INNER JOIN chain c ON l.parent_id = c.id
         )
         SELECT l.* FROM letters l
         INNER JOIN chain c ON l.id = c.id
         ORDER BY c.depth ASC, l.created_at ASC`
      )
      .all(rootId);
  }
};

module.exports = LetterModel;
