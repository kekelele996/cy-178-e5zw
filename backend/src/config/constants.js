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

  LETTER_STATUS: {
    PENDING: 'pending',
    DELIVERED: 'delivered',
    SKIPPED: 'skipped',
    REPLIED: 'replied',
    // 限时转投：到期未回复也未跳过 → 回到寄件人待转投区
    AWAITING_FORWARD: 'awaiting_forward',
    // 寄件人在待转投区撤回 → 永久关闭
    WITHDRAWN: 'withdrawn',
    // 转投过一次后再次到期 → 自动永久关闭（转投只有一次）
    CLOSED: 'closed'
  },

  // 收信人处理时限（毫秒）：72 小时；转投后重新计时
  REPLY_WINDOW_MS: Number(process.env.REPLY_WINDOW_MS) || 72 * 60 * 60 * 1000,
  // 到期扫描间隔（毫秒）
  SWEEP_INTERVAL_MS: Number(process.env.SWEEP_INTERVAL_MS) || 60 * 1000,

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
    CONTENT_EMPTY: '信件内容不能为空',
    FAVORITED: '已收藏',
    UNFAVORITED: '已取消收藏',
    SKIPPED: '已跳过这封信',
    REPLIED: '回复已送达',
    FORWARDED: '信件已重新投入驿站',
    WITHDRAWN: '信件已撤回，不会再被投出',
    LETTER_EXPIRED: '这封信的处理时限已过',
    LETTER_NOT_WAITING: '这封信当前不在待转投区',
    FORWARD_USED_UP: '这封信已经转投过，不能再次转投',
    NO_FORWARD_TARGETS: '驿站暂时还没有可以接收的旅人，再等等吧',
    CONFLICT: '信件状态刚刚发生了变化，请刷新后重试'
  }
};
