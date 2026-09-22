const db = require('../data/database');
const LetterModel = require('../models/letterModel');
const UserModel = require('../models/userModel');
const FavoriteModel = require('../models/favoriteModel');
const { LETTER_STATUS, MESSAGES, REROUTE } = require('../config/constants');

const { DELIVERED, PENDING, REPLIED, SKIPPED, RETURNED, WITHDRAWN } = LETTER_STATUS;
const WAITING_STATUSES = [DELIVERED, PENDING];

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

const LetterService = {
  // Lazy expiry sweep. Time-driven state change is applied here, inside one
  // transaction, before any read or write touches a letter — so a letter can
  // never be acted upon past its deadline even without a background job.
  sweepExpired(now = Date.now()) {
    const expired = LetterModel.listExpiredRoots(now);
    if (!expired.length) return 0;
    db.transaction(() => {
      expired.forEach((letter) => {
        const moved = LetterModel.transition({
          id: letter.id,
          fromStatuses: WAITING_STATUSES,
          changes: { status: RETURNED, expires_at: 0 }
        });
        if (moved) {
          // The original receiver's favorite and entry points die immediately.
          LetterModel.deleteReceiverFavorites({
            letterId: letter.id,
            receiverId: letter.receiver_id
          });
        }
      });
    })();
    return expired.length;
  },

  sendRandom({ senderId, content }) {
    const other = UserModel.findRandomOther(senderId);
    if (!other) fail('NO_USERS', MESSAGES.NO_OTHER_USERS);
    const now = Date.now();
    const id = LetterModel.create({
      senderId,
      receiverId: other.id,
      parentId: null,
      content,
      status: DELIVERED,
      createdAt: now,
      expiresAt: now + REROUTE.WINDOW_MS
    });
    return LetterModel.findById(id);
  },

  reply({ userId, parentId, content }) {
    this.sweepExpired();
    const parent = LetterModel.findById(parentId);
    if (!parent) fail('NOT_FOUND', MESSAGES.LETTER_NOT_FOUND);

    const rootId = LetterModel.findRootByChild(parent.id);
    const root = LetterModel.findById(rootId);
    if (root.sender_id !== userId && root.receiver_id !== userId) {
      fail('FORBIDDEN', MESSAGES.NOT_YOUR_LETTER);
    }

    // Opening a conversation consumes the 72h window. The conditional UPDATE
    // means a reply racing the expiry sweep (or another reply) loses cleanly.
    if (WAITING_STATUSES.includes(root.status)) {
      if (root.receiver_id !== userId) fail('FORBIDDEN', MESSAGES.NOT_YOUR_LETTER);
      const opened = LetterModel.transition({
        id: root.id,
        fromStatuses: WAITING_STATUSES,
        changes: { status: REPLIED, expires_at: 0 }
      });
      if (!opened) fail('CONFLICT', MESSAGES.ALREADY_PROCESSED);
    } else if (root.status !== REPLIED) {
      fail(root.status === WITHDRAWN ? 'GONE' : 'EXPIRED', MESSAGES.EXPIRED);
    }

    const receiverId = root.receiver_id === userId ? root.sender_id : root.receiver_id;
    const id = LetterModel.create({
      senderId: userId,
      receiverId,
      parentId: rootId,
      content,
      status: REPLIED,
      createdAt: Date.now(),
      expiresAt: 0
    });
    return LetterModel.findById(id);
  },

  skip({ userId, letterId }) {
    this.sweepExpired();
    const letter = LetterModel.findById(letterId);
    if (!letter) fail('NOT_FOUND', MESSAGES.LETTER_NOT_FOUND);
    if (letter.parent_id !== null) fail('FORBIDDEN', MESSAGES.NOT_YOUR_LETTER);
    if (letter.receiver_id !== userId) fail('FORBIDDEN', MESSAGES.NOT_YOUR_LETTER);

    const skipped = LetterModel.transition({
      id: letter.id,
      fromStatuses: WAITING_STATUSES,
      changes: { status: SKIPPED, expires_at: 0 }
    });
    if (!skipped) {
      fail('EXPIRED', letter.status === RETURNED ? MESSAGES.EXPIRED : MESSAGES.ALREADY_PROCESSED);
    }
    return true;
  },

  // The sender edits the body and sends the returned letter out exactly once.
  reroute({ userId, letterId, content }) {
    this.sweepExpired();
    const letter = LetterModel.findById(letterId);
    if (!letter) fail('NOT_FOUND', MESSAGES.LETTER_NOT_FOUND);
    if (letter.parent_id !== null) fail('FORBIDDEN', MESSAGES.NOT_YOUR_LETTER);
    if (letter.sender_id !== userId) fail('FORBIDDEN', MESSAGES.NOT_YOUR_LETTER);
    if (letter.status !== RETURNED) fail('BAD_REQUEST', MESSAGES.NOT_REROUTABLE);
    if (letter.reroute_count > 0) fail('BAD_REQUEST', MESSAGES.REROUTE_USED);

    const target = UserModel.findRandomOtherExcept(userId, letter.receiver_id);
    if (!target) fail('NO_USERS', MESSAGES.NO_OTHER_USERS);

    const now = Date.now();
    const sent = db.transaction(() => {
      const ok = LetterModel.transition({
        id: letter.id,
        fromStatuses: [RETURNED],
        changes: {
          status: DELIVERED,
          receiver_id: target.id,
          reroute_count: 1,
          expires_at: now + REROUTE.WINDOW_MS
        }
      });
      if (!ok) return false;
      LetterModel.updateContent(letter.id, content);
      LetterModel.deleteReceiverFavorites({
        letterId: letter.id,
        receiverId: letter.receiver_id
      });
      return true;
    })();
    if (!sent) fail('CONFLICT', MESSAGES.ALREADY_PROCESSED);
    return LetterModel.findById(letter.id);
  },

  // Sender withdrawal from the pending-reroute area closes the letter forever.
  withdraw({ userId, letterId }) {
    this.sweepExpired();
    const letter = LetterModel.findById(letterId);
    if (!letter) fail('NOT_FOUND', MESSAGES.LETTER_NOT_FOUND);
    if (letter.parent_id !== null) fail('FORBIDDEN', MESSAGES.NOT_YOUR_LETTER);
    if (letter.sender_id !== userId) fail('FORBIDDEN', MESSAGES.NOT_YOUR_LETTER);

    const closed = db.transaction(() => {
      const ok = LetterModel.transition({
        id: letter.id,
        fromStatuses: [RETURNED],
        changes: { status: WITHDRAWN, expires_at: 0 }
      });
      if (ok) {
        LetterModel.deleteReceiverFavorites({
          letterId: letter.id,
          receiverId: letter.receiver_id
        });
      }
      return ok;
    })();
    if (!closed) fail('BAD_REQUEST', MESSAGES.NOT_WITHDRAWABLE);
    return true;
  },

  // Receiver operations on a letter the deadline has reclaimed are rejected.
  assertReceiverAccess(user, root) {
    if (root.sender_id === user) return;
    if (root.receiver_id !== user) fail('FORBIDDEN', MESSAGES.NOT_YOUR_LETTER);
    if (root.status === RETURNED || root.status === WITHDRAWN) {
      fail('GONE', MESSAGES.EXPIRED);
    }
  },

  toggleFavorite({ userId, letterId }) {
    this.sweepExpired();
    const letter = LetterModel.findById(letterId);
    if (!letter) fail('NOT_FOUND', MESSAGES.LETTER_NOT_FOUND);
    const root =
      letter.parent_id === null ? letter : LetterModel.findById(LetterModel.findRootByChild(letter.id));
    this.assertReceiverAccess(userId, root);

    const exists = FavoriteModel.exists({ userId, letterId });
    if (exists) {
      FavoriteModel.remove({ userId, letterId });
      return { favorited: false };
    }
    FavoriteModel.add({ userId, letterId, createdAt: Date.now() });
    return { favorited: true };
  },

  getRerouteLetter({ userId, letterId }) {
    this.sweepExpired();
    const letter = LetterModel.findById(letterId);
    if (!letter) fail('NOT_FOUND', MESSAGES.LETTER_NOT_FOUND);
    if (letter.parent_id !== null || letter.sender_id !== userId) {
      fail('FORBIDDEN', MESSAGES.NOT_YOUR_LETTER);
    }
    if (letter.status !== RETURNED) fail('BAD_REQUEST', MESSAGES.NOT_REROUTABLE);
    // The body is kept for the sender; the (old) receiver info is never sent.
    return {
      id: letter.id,
      content: letter.content,
      status: letter.status,
      createdAt: letter.created_at,
      returnedAt: letter.expires_at === 0 ? letter.created_at : letter.expires_at,
      rerouteCount: letter.reroute_count,
      canReroute: letter.reroute_count === 0
    };
  },

  listInbox(userId) {
    this.sweepExpired();
    const rawSent = LetterModel.listSentByUser(userId).filter(
      // Returned letters live in the reroute area, not among active sends.
      (l) => l.status !== RETURNED
    );
    const rawReceived = LetterModel.listReceivedByUser(userId);
    const rawConvos = LetterModel.listConversationsForUser(userId);
    const rawReroutes = LetterModel.listPendingReroutes(userId);
    const favorites = new Set(FavoriteModel.listByUser(userId).map((l) => l.id));

    const decorate = (list, role) =>
      list.map((l) => ({
        id: l.id,
        preview: l.content.slice(0, 80),
        status: l.status,
        createdAt: l.created_at,
        expiresAt: l.expires_at,
        rerouteCount: l.reroute_count,
        replyCount: l.reply_count,
        role,
        favorited: favorites.has(l.id)
      }));

    return {
      sent: decorate(rawSent, 'sent'),
      received: decorate(rawReceived, 'received'),
      conversations: decorate(rawConvos, 'either'),
      reroutes: decorate(rawReroutes, 'sender')
    };
  },

  getThread({ userId, rootId }) {
    this.sweepExpired();
    const thread = LetterModel.listThread(rootId);
    if (!thread.length) fail('NOT_FOUND', MESSAGES.LETTER_NOT_FOUND);
    const root = thread[0];
    this.assertReceiverAccess(userId, root);

    return {
      rootId,
      status: root.status,
      rerouteCount: root.reroute_count,
      favorited: FavoriteModel.exists({ userId, letterId: rootId }),
      messages: thread.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.created_at,
        fromMe: m.sender_id === userId
      }))
    };
  }
};

module.exports = LetterService;
