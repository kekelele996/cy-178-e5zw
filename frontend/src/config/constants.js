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
  FAVORITE_LETTER: (id) => `${API_BASE}/api/letters/${id}/favorite`,
  THREAD: (id) => `${API_BASE}/api/letters/${id}/thread`,
  REROUTE_LETTER: (id) => `${API_BASE}/api/letters/${id}/reroute`,
  WITHDRAW_LETTER: (id) => `${API_BASE}/api/letters/${id}/withdraw`,
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
  REROUTE: '/reroute/:id'
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
  REROUTES: '待转投',
  FAVORITE: '收藏',
  UNFAVORITE: '取消收藏',
  REPLY: '回复',
  SKIP: '跳过',
  SEND: '投入驿站',
  CONTENT_PLACEHOLDER: '写下此刻想对陌生人说的话……',
  EMPTY_SENT: '还没有寄出的信',
  EMPTY_RECEIVED: '信箱空空，等一封信',
  EMPTY_CONVERSATIONS: '没有在持续的对话',
  EMPTY_REROUTES: '没有到期退回的信',
  BACK: '返回',
  REPLY_PLACEHOLDER: '回信给这位陌生人……',
  SUBMIT_REPLY: '寄出回复',
  SENT_FROM_ME: '我寄出',
  SENT_FROM_STRANGER: '陌生人',
  REROUTE_HINT: '对方超过 72 小时未回复也未跳过，信已退回给你。原收信信息已隐藏，可修改正文后转投一次。',
  REROUTE_USED_HINT: '这封信已转投过一次，不能再次转投，仅可撤回。',
  REROUTE_SUBMIT: '修改后转投',
  REROUTING: '转投中…',
  WITHDRAW: '撤回',
  WITHDRAW_CONFIRM: '撤回后这封信将永久关闭，确定吗？',
  TIME_LEFT: (hours) => `剩 ${hours} 小时`,
  RETURNED_HINT: '已退回，请到「待转投」处理'
};

export const STATUS_TEXT = {
  pending: '待处理',
  delivered: '已送达',
  skipped: '已跳过',
  replied: '已回复',
  returned: '已退回',
  rerouted: '已转投',
  withdrawn: '已撤回'
};
