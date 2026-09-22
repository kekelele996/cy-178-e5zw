const LetterModel = require('../models/letterModel');
const UserModel = require('../models/userModel');
const FavoriteModel = require('../models/favoriteModel');
const {
  LETTER_STATUS,
  REPLY_WINDOW_MS,
  MESSAGES
} = require('../config/constants');

function fail(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

// 是否为当前生效的收信人；待转投/撤回/关闭后 receiver_id 为 NULL，旧收信人立即失去入口
function isCurrentReceiver(letter, userId) {
  return letter.receiver_id === userId;
}

// 已到期/关闭的信，操作人是上一任收信人：入口虽作废，但语义上是"过期"而非"无权"
function isExpiredReceiver(letter, userId) {
  return (
    letter.previous_receiver_id === userId &&
    [
      LETTER_STATUS.AWAITING_FORWARD,
      LETTER_STATUS.WITHDRAWN,
      LETTER_STATUS.CLOSED
    ].includes(letter.status)
  );
}

// 视图权限：寄件人，或当前生效的收信人。原收信人在收信信息隐藏后无权再访问
function assertCanView(letter, userId) {
  if (letter.sender_id === userId || letter.receiver_id === userId) return;
  fail(MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
}

const LetterService = {
  // 任何操作前先推进到期状态，保证"过期操作"不可能成功
  sweepExpired(now = Date.now()) {
    return LetterModel.sweepExpired(now);
  },

  sendRandom({ senderId, content }) {
    const other = UserModel.findRandomOther(senderId);
    if (!other) {
      fail(MESSAGES.NO_OTHER_USERS, 'NO_USERS');
    }
    const now = Date.now();
    const id = LetterModel.create({
      senderId,
      receiverId: other.id,
      parentId: null,
      content,
      status: LETTER_STATUS.DELIVERED,
      createdAt: now,
      expiresAt: now + REPLY_WINDOW_MS
    });
    return LetterModel.findById(id);
  },

  reply({ userId, parentId, content }) {
    const now = Date.now();
    LetterModel.sweepExpired(now);

    const parent = LetterModel.findById(parentId);
    if (!parent) fail(MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');

    const rootId = parent.parent_id == null ? parent.id : LetterModel.findRootByChild(parent.id);
    const root = LetterModel.findById(rootId);
    if (!root) fail(MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');

    const senderIsRootSender = root.sender_id === userId;
    const senderIsCurrentReceiver = isCurrentReceiver(root, userId);
    if (!senderIsRootSender && !senderIsCurrentReceiver) {
      if (isExpiredReceiver(root, userId)) {
        fail(MESSAGES.LETTER_EXPIRED, 'EXPIRED');
      }
      fail(MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
    }

    // 对话中的后续回复：只在双方已有对话、且彼此仍是当事人时允许
    if (root.status === LETTER_STATUS.REPLIED) {
      if (root.receiver_id == null) {
        // 理论上 replied 不会被到期扫描命中，这里兜底保护原收信人入口
        fail(MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
      }
      // 寄件人回给当前收信人；当前收信人回给寄件人
      const receiverId = senderIsRootSender ? root.receiver_id : root.sender_id;
      const id = LetterModel.create({
        senderId: userId,
        receiverId,
        parentId: rootId,
        content,
        status: LETTER_STATUS.REPLIED,
        createdAt: now
      });
      return LetterModel.findById(id);
    }

    // 首封回复必须是当前收信人，且信件仍在时限内；原子抢占，和跳过/到期互斥
    if (root.status !== LETTER_STATUS.DELIVERED) {
      // pending（正常不应出现）/ 待转投 / 已撤回 / 已关闭
      fail(MESSAGES.LETTER_EXPIRED, 'EXPIRED');
    }
    if (!senderIsCurrentReceiver) {
      fail(MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
    }
    const won = LetterModel.acceptFirstReply({
      rootId,
      receiverId: userId,
      now
    });
    if (!won) {
      // 刚被跳过 / 刚到期 / 已回复
      fail(MESSAGES.CONFLICT, 'CONFLICT');
    }
    const id = LetterModel.create({
      senderId: userId,
      receiverId: root.sender_id,
      parentId: rootId,
      content,
      status: LETTER_STATUS.REPLIED,
      createdAt: now
    });
    return LetterModel.findById(id);
  },

  skip({ userId, letterId }) {
    const now = Date.now();
    LetterModel.sweepExpired(now);

    const letter = LetterModel.findById(letterId);
    if (!letter || letter.parent_id != null) {
      fail(MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');
    }
    if (!isCurrentReceiver(letter, userId)) {
      if (isExpiredReceiver(letter, userId)) {
        fail(MESSAGES.LETTER_EXPIRED, 'EXPIRED');
      }
      fail(MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
    }
    // 条件更新：过期、重复跳过、与回复同时到达时，只有一个能成功
    const won = LetterModel.skipIfDelivered({
      letterId,
      receiverId: userId,
      now
    });
    if (!won) fail(MESSAGES.CONFLICT, 'CONFLICT');
    return true;
  },

  // 限时转投：只能在原信到期后（待转投区）发生，且整封信只能转投一次
  forward({ userId, letterId, content }) {
    const now = Date.now();
    LetterModel.sweepExpired(now);

    const letter = LetterModel.findById(letterId);
    if (!letter || letter.parent_id != null) {
      fail(MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');
    }
    if (letter.sender_id !== userId) {
      fail(MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
    }
    if (letter.status !== LETTER_STATUS.AWAITING_FORWARD) {
      // 未到期就想转投、已撤回、已关闭，统统不允许
      fail(MESSAGES.LETTER_NOT_WAITING, 'NOT_WAITING');
    }
    if (letter.forward_count > 0) {
      fail(MESSAGES.FORWARD_USED_UP, 'FORWARD_USED');
    }

    // 正文默认保留，寄件人可修改后再投出
    const nextContent =
      content != null && content.trim() ? content.trim() : letter.content;

    // 排除寄件人本人和上一位收信人，转投给一位全新的旅人
    const other = UserModel.findRandomOtherExcept(userId, [letter.previous_receiver_id]);
    if (!other) {
      fail(MESSAGES.NO_FORWARD_TARGETS, 'NO_TARGETS');
    }

    const won = LetterModel.forward({
      letterId,
      senderId: userId,
      newReceiverId: other.id,
      content: nextContent,
      expiresAt: now + REPLY_WINDOW_MS
    });
    if (!won) {
      // 重复转投 / 撤回 / 状态竞争：只有一个成功结果
      fail(MESSAGES.CONFLICT, 'CONFLICT');
    }
    return LetterModel.findById(letterId);
  },

  // 寄件人撤回：永久关闭
  withdraw({ userId, letterId }) {
    const now = Date.now();
    LetterModel.sweepExpired(now);

    const letter = LetterModel.findById(letterId);
    if (!letter || letter.parent_id != null) {
      fail(MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');
    }
    if (letter.sender_id !== userId) {
      fail(MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
    }
    const won = LetterModel.withdraw({ letterId, senderId: userId });
    if (!won) fail(MESSAGES.CONFLICT, 'CONFLICT');
    return true;
  },

  toggleFavorite({ userId, letterId }) {
    const now = Date.now();
    LetterModel.sweepExpired(now);

    const letter = LetterModel.findById(letterId);
    if (!letter || letter.parent_id != null) {
      fail(MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');
    }
    if (letter.sender_id !== userId && letter.receiver_id !== userId) {
      if (isExpiredReceiver(letter, userId)) {
        fail(MESSAGES.LETTER_EXPIRED, 'EXPIRED');
      }
      fail(MESSAGES.NOT_YOUR_LETTER, 'FORBIDDEN');
    }
    // 原收信人的收藏入口在到期隐藏收信信息时立即作废，不能再收藏
    const exists = FavoriteModel.exists({ userId, letterId });
    if (exists) {
      FavoriteModel.remove({ userId, letterId });
      return { favorited: false };
    }
    FavoriteModel.add({ userId, letterId, createdAt: now });
    return { favorited: true };
  },

  isFavorited({ userId, letterId }) {
    return FavoriteModel.exists({ userId, letterId });
  },

  listInbox(userId) {
    const now = Date.now();
    LetterModel.sweepExpired(now);

    const rawSent = LetterModel.listSentByUser(userId);
    const rawReceived = LetterModel.listReceivedByUser(userId);
    const rawConvos = LetterModel.listConversationsForUser(userId);
    const rawWaiting = LetterModel.listAwaitingForwardByUser(userId);
    const favorites = new Set(FavoriteModel.listByUser(userId).map((l) => l.id));

    const decorate = (list, role) =>
      list.map((l) => ({
        id: l.id,
        preview: l.content.slice(0, 80),
        status: l.status,
        createdAt: l.created_at,
        expiresAt: l.expires_at,
        now,
        forwardCount: l.forward_count,
        replyCount: l.reply_count,
        role,
        favorited: favorites.has(l.id)
      }));

    return {
      sent: decorate(rawSent, 'sent'),
      received: decorate(rawReceived, 'received'),
      conversations: decorate(rawConvos, 'either'),
      awaitingForward: decorate(rawWaiting, 'sender')
    };
  },

  getThread({ userId, rootId }) {
    const now = Date.now();
    LetterModel.sweepExpired(now);

    const thread = LetterModel.listThread(rootId);
    if (!thread.length) fail(MESSAGES.LETTER_NOT_FOUND, 'NOT_FOUND');
    const root = thread[0];
    assertCanView(root, userId);

    const me = userId;
    return {
      rootId,
      status: root.status,
      expiresAt: root.expires_at,
      now,
      forwardCount: root.forward_count,
      favorited: FavoriteModel.exists({ userId, letterId: rootId }),
      messages: thread.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.created_at,
        fromMe: m.sender_id === me
      }))
    };
  }
};

module.exports = LetterService;
