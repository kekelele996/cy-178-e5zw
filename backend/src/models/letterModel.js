const db = require('../data/database');
const { LETTER_STATUS: LetterStatus } = require('../config/constants');

const LetterModel = {
  create({ senderId, receiverId, parentId, content, status, createdAt, expiresAt = null }) {
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
      expiresAt
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

  updateStatus(id, status) {
    return db.prepare('UPDATE letters SET status = ? WHERE id = ?').run(status, id);
  },

  // ---- 限时转投 ----

  // 到期扫描：送达超过时限、收信人既没回复也没跳过的根信。
  // 第一次到期进入待转投区；转投过的信再次到期则永久关闭。
  // 收信信息（receiver_id）一律清空，正文保留；原收信人的收藏同时作废。
  sweepExpired(now) {
    const expireOne = db.transaction((letter) => {
      const oldReceiver = letter.receiver_id;
      const nextStatus =
        letter.forward_count > 0
          ? LetterStatus.CLOSED
          : LetterStatus.AWAITING_FORWARD;
      db.prepare(
        `UPDATE letters
            SET status = ?, receiver_id = NULL,
                previous_receiver_id = COALESCE(previous_receiver_id, ?),
                expires_at = NULL
          WHERE id = ?`
      ).run(nextStatus, oldReceiver, letter.id);
      db.prepare('DELETE FROM favorites WHERE letter_id = ? AND user_id = ?').run(
        letter.id,
        oldReceiver
      );
    });

    const expired = db
      .prepare(
        `SELECT * FROM letters
          WHERE parent_id IS NULL AND status = ? AND expires_at IS NOT NULL
            AND expires_at <= ?`
      )
      .all(LetterStatus.DELIVERED, now);
    expired.forEach((letter) => expireOne(letter));
    return expired.length;
  },

  // 待转投区：只有寄件人能看到，receiver_id 已为 NULL（收信信息隐藏）
  listAwaitingForwardByUser(userId) {
    return db
      .prepare(
        `SELECT * FROM letters
          WHERE sender_id = ? AND parent_id IS NULL
            AND status = ?
          ORDER BY created_at DESC`
      )
      .all(userId, LetterStatus.AWAITING_FORWARD);
  },

  // 原子转投：仅待转投、且从未转投过的信可以转投；转投后重新计时。
  // 条件更新保证重复转投 / 撤回 / 到期等并发请求只有一个成功。
  forward({ letterId, senderId, newReceiverId, content, expiresAt }) {
    const info = db
      .prepare(
        `UPDATE letters
            SET status = ?, receiver_id = ?, content = ?, expires_at = ?,
                forward_count = forward_count + 1
          WHERE id = ? AND sender_id = ? AND parent_id IS NULL
            AND status = ? AND forward_count = 0`
      )
      .run(
        LetterStatus.DELIVERED,
        newReceiverId,
        content,
        expiresAt,
        letterId,
        senderId,
        LetterStatus.AWAITING_FORWARD
      );
    return info.changes === 1;
  },

  // 寄件人撤回：永久关闭，不可再转投
  withdraw({ letterId, senderId }) {
    const run = db.transaction(() => {
      const before = db.prepare('SELECT * FROM letters WHERE id = ?').get(letterId);
      const info = db
        .prepare(
          `UPDATE letters
              SET status = ?, receiver_id = NULL,
                  previous_receiver_id = COALESCE(previous_receiver_id, receiver_id),
                  expires_at = NULL
            WHERE id = ? AND sender_id = ? AND parent_id IS NULL
              AND status = ?`
        )
        .run(
          LetterStatus.WITHDRAWN,
          letterId,
          senderId,
          LetterStatus.AWAITING_FORWARD
        );
      if (info.changes === 1 && before && before.receiver_id != null) {
        db.prepare('DELETE FROM favorites WHERE letter_id = ? AND user_id = ?').run(
          letterId,
          before.receiver_id
        );
      }
      return info.changes === 1;
    });
    return run();
  },

  // 原子跳过：只有仍在处理时限内、当前收信人能跳过
  skipIfDelivered({ letterId, receiverId, now }) {
    const info = db
      .prepare(
        `UPDATE letters
            SET status = ?, expires_at = NULL
          WHERE id = ? AND parent_id IS NULL AND receiver_id = ?
            AND status = ? AND expires_at IS NOT NULL AND expires_at > ?`
      )
      .run(LetterStatus.SKIPPED, letterId, receiverId, LetterStatus.DELIVERED, now);
    return info.changes === 1;
  },

  // 首封回复原子抢占：回复与跳过/到期同时到达时只有一个成功
  acceptFirstReply({ rootId, receiverId, now }) {
    const info = db
      .prepare(
        `UPDATE letters
            SET status = ?, expires_at = NULL
          WHERE id = ? AND parent_id IS NULL AND receiver_id = ?
            AND status = ? AND expires_at IS NOT NULL AND expires_at > ?`
      )
      .run(LetterStatus.REPLIED, rootId, receiverId, LetterStatus.DELIVERED, now);
    return info.changes === 1;
  },

  // ---- 信箱列表 ----

  listSentByUser(userId) {
    return db
      .prepare(
        `SELECT l.*,
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.sender_id = ? AND l.parent_id IS NULL
           AND l.status != ?
         ORDER BY l.created_at DESC`
      )
      .all(userId, LetterStatus.AWAITING_FORWARD);
  },

  listReceivedByUser(userId) {
    return db
      .prepare(
        `SELECT l.*,
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.receiver_id = ? AND l.parent_id IS NULL
         ORDER BY l.created_at DESC`
      )
      .all(userId);
  },

  listConversationsForUser(userId) {
    return db
      .prepare(
        `SELECT DISTINCT l.*,
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.parent_id IS NULL
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
