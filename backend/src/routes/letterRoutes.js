const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const LetterService = require('../services/letterService');
const { MESSAGES } = require('../config/constants');

const router = Router();
router.use(requireAuth);

// 业务错误码 → HTTP 状态
function statusFor(code) {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'FORBIDDEN':
      return 403;
    case 'EXPIRED':
    case 'NOT_WAITING':
    case 'FORWARD_USED':
      return 410; // 信件已过期/已关闭，操作入口作废
    case 'CONFLICT':
      return 409; // 重复操作 / 同时到达的请求只有一个成功
    case 'NO_USERS':
    case 'NO_TARGETS':
    case 'BAD_REQUEST':
      return 400;
    default:
      return 500;
  }
}

function fail(res, err) {
  res.status(statusFor(err.code)).json({ error: err.message, code: err.code });
}

router.post('/', (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ error: MESSAGES.CONTENT_EMPTY });
    }
    const letter = LetterService.sendRandom({
      senderId: req.user.id,
      content: content.trim()
    });
    res.json({ message: MESSAGES.LETTER_SENT, id: letter.id });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/reply', (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '回复内容不能为空' });
    }
    const reply = LetterService.reply({
      userId: req.user.id,
      parentId: Number(req.params.id),
      content: content.trim()
    });
    res.json({ message: MESSAGES.REPLIED, id: reply.id });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/skip', (req, res) => {
  try {
    LetterService.skip({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json({ message: MESSAGES.SKIPPED });
  } catch (err) {
    fail(res, err);
  }
});

// 限时转投：原信到期后，寄件人在待转投区修改正文重新投出（仅一次）
router.post('/:id/forward', (req, res) => {
  try {
    const { content } = req.body || {};
    const letter = LetterService.forward({
      userId: req.user.id,
      letterId: Number(req.params.id),
      content: typeof content === 'string' ? content : undefined
    });
    res.json({ message: MESSAGES.FORWARDED, id: letter.id });
  } catch (err) {
    fail(res, err);
  }
});

// 寄件人撤回待转投的信：永久关闭
router.post('/:id/withdraw', (req, res) => {
  try {
    LetterService.withdraw({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json({ message: MESSAGES.WITHDRAWN });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/favorite', (req, res) => {
  try {
    const result = LetterService.toggleFavorite({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json({
      message: result.favorited ? MESSAGES.FAVORITED : MESSAGES.UNFAVORITED,
      favorited: result.favorited
    });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/:id/thread', (req, res) => {
  try {
    const thread = LetterService.getThread({
      userId: req.user.id,
      rootId: Number(req.params.id)
    });
    res.json(thread);
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
