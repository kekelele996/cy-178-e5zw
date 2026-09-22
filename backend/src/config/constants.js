// Global constants configuration — keep all string literals in one place
module.exports = {
  PORTS: {
    FRONTEND: Number(process.env.FRONTEND_PORT) || 8178,
    BACKEND: Number(process.env.PORT || process.env.BACKEND_PORT) || 9178,
    DATABASE: Number(process.env.DB_PORT) || 10178
  },

  DB: {
    FILE: process.env.SQLITE_PATH || 'data/letter_pigeon.db'
  },

  JWT: {
    SECRET: process.env.JWT_SECRET || 'letter-pigeon-dev-secret-change-me',
    EXPIRY: '7d'
  },

  ROUTES: {
    AUTH: '/api/auth',
    LETTERS: '/api/letters',
    INBOX: '/api/inbox'
  },

  // Time-limited re-routing window: the receiver has this long to reply or skip
  REROUTE: {
    WINDOW_MS: Number(process.env.LETTER_WINDOW_MS) || 72 * 60 * 60 * 1000
  },

  LETTER_STATUS: {
    PENDING: 'pending',
    DELIVERED: 'delivered',
    SKIPPED: 'skipped',
    REPLIED: 'replied',
    RETURNED: 'returned',
    REROUTED: 'rerouted',
    WITHDRAWN: 'withdrawn'
  },

  ROLES: {
    SENDER: 'sender',
    RECEIVER: 'receiver'
  },

  CATEGORIES: {
    SENT: 'sent',
    RECEIVED: 'received',
    CONVERSATIONS: 'conversations'
  },

  MESSAGES: {
    USERNAME_TAKEN: '该笔名已被占用',
    REGISTER_OK: '注册成功',
    LOGIN_FAIL: '笔名或密码错误',
    UNAUTHORIZED: '请先登录',
    NO_OTHER_USERS: '驿站暂时还没有其他旅人，再等等吧',
    LETTER_NOT_FOUND: '信件不存在',
    NOT_YOUR_LETTER: '这不是你的信件',
    LETTER_SENT: '信件已投入驿站',
    FAVORITED: '已收藏',
    UNFAVORITED: '已取消收藏',
    SKIPPED: '已跳过这封信',
    REPLIED: '回复已送达',
    EXPIRED: '这封信已经过了 72 小时，驿站已收回',
    ALREADY_PROCESSED: '这封信已被处理，请刷新后再试',
    NOT_REROUTABLE: '只有退回的信才能转投',
    REROUTED: '信件已重新投出',
    REROUTE_USED: '这封信已经转投过一次，不能再转投了',
    NOT_WITHDRAWABLE: '只有待转投区里的信才能撤回',
    WITHDRAWN: '信件已撤回，不会再被投递',
    FAVORITE_CLOSED: '信件已关闭，不能再收藏'
  }
};
