const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const LetterService = require('../services/letterService');
const { MESSAGES } = require('../config/constants');

const router = Router();
router.use(requireAuth);

function sendError(res, err) {
  const status =
    err.code === 'NOT_FOUND'
      ? 404
      : err.code === 'FORBIDDEN'
        ? 403
        : err.code === 'GONE' || err.code === 'EXPIRED'
        ? 410
        : err.code === 'CONFLICT'
            ? 409
            : err.code === 'BAD_REQUEST' || err.code === 'NO_USERS'
              ? 400
              : 500;
  res.status(status).json({ error: err.message, code: err.code });
}

router.post('/', (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '信件内容不能为空' });
    }
    const letter = LetterService.sendRandom({
      senderId: req.user.id,
      content: content.trim()
    });
    res.json({ message: MESSAGES.LETTER_SENT, id: letter.id });
  } catch (err) {
    sendError(res, err);
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
    sendError(res, err);
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
    sendError(res, err);
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
    sendError(res, err);
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
    sendError(res, err);
  }
});

// Pending-reroute area: fetch the returned letter body (receiver hidden).
router.get('/:id/reroute', (req, res) => {
  try {
    const letter = LetterService.getRerouteLetter({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json(letter);
  } catch (err) {
    sendError(res, err);
  }
});

// Edit the body and re-deliver exactly once; the 72h window restarts.
router.post('/:id/reroute', (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '信件内容不能为空' });
    }
    const letter = LetterService.reroute({
      userId: req.user.id,
      letterId: Number(req.params.id),
      content: content.trim()
    });
    res.json({ message: MESSAGES.REROUTED, id: letter.id });
  } catch (err) {
    sendError(res, err);
  }
});

// Withdraw a returned letter: permanently closed, can never be rerouted.
router.post('/:id/withdraw', (req, res) => {
  try {
    LetterService.withdraw({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json({ message: MESSAGES.WITHDRAWN });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
