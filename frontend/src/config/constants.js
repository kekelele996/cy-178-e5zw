// Global string constants and endpoints — single source of truth

export const PORTS = {
  FRONTEND: 8178,
  BACKEND: 9178,
  DATABASE: 10178
};

export const API_BASE = '';

export const ENDPOINTS = {
  REGISTER: `${API_BASE}/api/auth/register`,
  LOGIN: `${API_BASE}/api/auth/login`,
  ME: `${API_BASE}/api/auth/me`,
  SEND_LETTER: `${API_BASE}/api/letters`,
  REPLY_LETTER: (id) => `${API_BASE}/api/letters/${id}/reply`,
  SKIP_LETTER: (id) => `${API_BASE}/api/letters/${id}/skip`,
  FORWARD_LETTER: (id) => `${API_BASE}/api/letters/${id}/forward`,
  WITHDRAW_LETTER: (id) => `${API_BASE}/api/letters/${id}/withdraw`,
  FAVORITE_LETTER: (id) => `${API_BASE}/api/letters/${id}/favorite`,
  THREAD: (id) => `${API_BASE}/api/letters/${id}/thread`,
  INBOX: `${API_BASE}/api/inbox`
};

export const STORAGE_KEYS = {
  TOKEN: 'lp_token',
  PEN_NAME: 'lp_pen_name'
};

export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  HOME: '/',
  COMPOSE: '/compose',
  INBOX: '/inbox',
  THREAD: '/thread/:id',
  FORWARD: '/forward/:id'
};

export const LABELS = {
  APP_TITLE: '信件驿站',
  APP_SUBTITLE: '写给陌生人的一封信',
  LOGIN_HINT: '用你的笔名继续未读完的信',
  REGISTER_HINT: '起一个笔名，匿名穿梭于驿站',
  PEN_NAME: '笔名',
  PASSWORD: '密码',
  LOGIN: '登录',
  REGISTER: '注册',
  SWITCH_TO_LOGIN: '已有笔名？去登录',
  SWITCH_TO_REGISTER: '没有笔名？去注册',
  LOGOUT: '退出',
  COMPOSE: '投一封信',
  MY_INBOX: '我的信箱',
  SENT: '发出的',
  RECEIVED: '收到的',
  CONVERSATIONS: '对话中',
  FAVORITE: '收藏',
  UNFAVORITE: '取消收藏',
  REPLY: '回复',
  SKIP: '跳过',
  SEND: '投入驿站',
  AWAITING_FORWARD: '待转投',
  FORWARD: '转投',
  WITHDRAW: '撤回',
  CONFIRM_WITHDRAW: '撤回后这封信将永久关闭，确定吗？',
  FORWARD_HINT: '72 小时已过，这封信回到了你的待转投区。收信信息已隐藏，你可以修改正文后转投给下一位陌生人（只能转投一次），也可以撤回永久关闭。',
  FORWARD_SEND: '修改后转投',
  FORWARD_KEEP: '不修改，直接转投',
  FORWARD_SENDING: '转投中…',
  CONTENT_PLACEHOLDER: '写下此刻想对陌生人说的话……',
  EMPTY_SENT: '还没有寄出的信',
  EMPTY_RECEIVED: '信箱空空，等一封信',
  EMPTY_CONVERSATIONS: '没有在持续的对话',
  EMPTY_AWAITING: '没有等待转投的信',
  BACK: '返回',
  REPLY_PLACEHOLDER: '回信给这位陌生人……',
  SUBMIT_REPLY: '寄出回复',
  SENT_FROM_ME: '我寄出',
  SENT_FROM_STRANGER: '陌生人'
};

export const STATUS_TEXT = {
  pending: '待处理',
  delivered: '已送达',
  skipped: '已跳过',
  replied: '已回复',
  awaiting_forward: '待转投',
  withdrawn: '已撤回',
  closed: '已关闭'
};

// 收信人处理时限：72 小时
export const REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;

// 把剩余毫秒格式化为 "还剩 71:59:03"
export function formatRemaining(ms) {
  if (ms <= 0) return '已超时';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `还剩 ${pad(h)}:${pad(m)}:${pad(s)}`;
}
