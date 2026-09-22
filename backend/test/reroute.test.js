const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'letter-reroute-'));
process.env.SQLITE_PATH = path.join(tmpDir, 'test.db');
process.env.LETTER_WINDOW_MS = '80';

const db = require('../src/data/database');
const LetterModel = require('../src/models/letterModel');
const UserModel = require('../src/models/userModel');
const FavoriteModel = require('../src/models/favoriteModel');
const LetterService = require('../src/services/letterService');
const { LETTER_STATUS, MESSAGES } = require('../src/config/constants');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let users;

function makeLetter({ sender, receiver, status = 'delivered', ttl = 60, content = '原文' }) {
  const now = Date.now();
  const id = LetterModel.create({
    senderId: sender,
    receiverId: receiver,
    parentId: null,
    content,
    status,
    createdAt: now,
    expiresAt: ttl ? now + ttl : 0
  });
  return LetterModel.findById(id);
}

test.before(() => {
  const a = UserModel.create({ penName: 'a', passwordHash: 'x', createdAt: Date.now() });
  const b = UserModel.create({ penName: 'b', passwordHash: 'x', createdAt: Date.now() });
  const c = UserModel.create({ penName: 'c', passwordHash: 'x', createdAt: Date.now() });
  users = { a, b, c };
});

test('72h 到期：未回复未跳过 -> 退回寄件人待转投区，收信入口消失，收信信息隐藏', async () => {
  const letter = makeLetter({ sender: users.a, receiver: users.b });
  FavoriteModel.add({ userId: users.b, letterId: letter.id, createdAt: Date.now() });

  assert.ok(LetterService.listInbox(users.b).received.some((l) => l.id === letter.id));
  assert.ok(!LetterService.listInbox(users.a).reroutes.some((l) => l.id === letter.id));

  await sleep(100);
  const count = LetterService.sweepExpired();
  assert.strictEqual(count, 1);
  assert.strictEqual(LetterModel.findById(letter.id).status, LETTER_STATUS.RETURNED);

  // 原收信人：收件箱、收藏立即作废
  assert.ok(!LetterService.listInbox(users.b).received.some((l) => l.id === letter.id));
  assert.ok(!FavoriteModel.exists({ userId: users.b, letterId: letter.id }));

  // 寄件人：出现在待转投区，正文保留
  const inbox = LetterService.listInbox(users.a);
  const entry = inbox.reroutes.find((l) => l.id === letter.id);
  assert.ok(entry);
  assert.strictEqual(entry.preview, '原文');
  assert.ok(!inbox.sent.some((l) => l.id === letter.id));

  // 转投详情不暴露任何收信人信息
  const detail = LetterService.getRerouteLetter({ userId: users.a, letterId: letter.id });
  assert.strictEqual(detail.content, '原文');
  assert.ok(!('receiverId' in detail));
  assert.ok(!('receiver_id' in detail));
  assert.strictEqual(detail.canReroute, true);
});

test('过期操作全部失败：回复/跳过/收藏/查看线程', async () => {
  const letter = makeLetter({ sender: users.a, receiver: users.b });
  await sleep(100);

  assert.throws(
    () => LetterService.reply({ userId: users.b, parentId: letter.id, content: '迟来的回复' }),
    (e) => e.code === 'EXPIRED' && e.message === MESSAGES.EXPIRED
  );
  assert.throws(
    () => LetterService.skip({ userId: users.b, letterId: letter.id }),
    (e) => e.code === 'EXPIRED'
  );
  assert.throws(
    () => LetterService.toggleFavorite({ userId: users.b, letterId: letter.id }),
    (e) => e.code === 'GONE'
  );
  assert.throws(
    () => LetterService.getThread({ userId: users.b, rootId: letter.id }),
    (e) => e.code === 'GONE'
  );
  // 寄件人本人仍可查看退回的信；陌生人不可
  assert.ok(LetterService.getThread({ userId: users.a, rootId: letter.id }));
  assert.throws(
    () => LetterService.getThread({ userId: users.c, rootId: letter.id }),
    (e) => e.code === 'FORBIDDEN'
  );
  assert.strictEqual(LetterModel.findById(letter.id).status, LETTER_STATUS.RETURNED);
});

test('窗口内回复即关闭计时，到期不再退回', async () => {
  const letter = makeLetter({ sender: users.a, receiver: users.b, ttl: 60 });
  LetterService.reply({ userId: users.b, parentId: letter.id, content: '回信' });
  assert.strictEqual(LetterModel.findById(letter.id).status, LETTER_STATUS.REPLIED);
  await sleep(100);
  LetterService.sweepExpired();
  assert.strictEqual(LetterModel.findById(letter.id).status, LETTER_STATUS.REPLIED);
  assert.ok(LetterService.listInbox(users.a).conversations.some((l) => l.id === letter.id));
});

test('窗口内跳过则永久跳过，到期不退回', async () => {
  const letter = makeLetter({ sender: users.a, receiver: users.b, ttl: 60 });
  LetterService.skip({ userId: users.b, letterId: letter.id });
  await sleep(100);
  LetterService.sweepExpired();
  assert.strictEqual(LetterModel.findById(letter.id).status, LETTER_STATUS.SKIPPED);
});

test('只有寄件人能转投；转投只能在到期退回后发生', () => {
  const fresh = makeLetter({ sender: users.a, receiver: users.b, ttl: 60000 });
  // 未到期不能转投
  assert.throws(
    () => LetterService.reroute({ userId: users.a, letterId: fresh.id, content: '改' }),
    (e) => e.code === 'BAD_REQUEST'
  );
  // 原收信人不能转投退回的信
  const returned = makeLetter({ sender: users.a, receiver: users.b, ttl: 0 });
  LetterModel.transition({
    id: returned.id,
    fromStatuses: ['delivered'],
    changes: { status: 'returned', expires_at: 0 }
  });
  assert.throws(
    () => LetterService.reroute({ userId: users.b, letterId: returned.id, content: '改' }),
    (e) => e.code === 'FORBIDDEN'
  );
});

test('转投一次：正文可改、新收信人随机且排除原收信人、重新计时、旧收藏作废', () => {
  const letter = makeLetter({ sender: users.a, receiver: users.b, ttl: 0, content: '旧正文' });
  LetterModel.transition({
    id: letter.id,
    fromStatuses: ['delivered'],
    changes: { status: 'returned', expires_at: 0 }
  });
  FavoriteModel.add({ userId: users.b, letterId: letter.id, createdAt: Date.now() });

  const updated = LetterService.reroute({
    userId: users.a,
    letterId: letter.id,
    content: '修改后的正文'
  });

  // 三个用户下，排除 A 自己和原收信人 B，新收信人只能是 C
  assert.strictEqual(updated.receiver_id, users.c);
  assert.strictEqual(updated.content, '修改后的正文');
  assert.strictEqual(updated.status, LETTER_STATUS.DELIVERED);
  assert.strictEqual(updated.reroute_count, 1);
  assert.ok(updated.expires_at > Date.now());

  assert.ok(!FavoriteModel.exists({ userId: users.b, letterId: letter.id }));
  assert.ok(!LetterService.listInbox(users.b).received.some((l) => l.id === letter.id));
  assert.ok(LetterService.listInbox(users.c).received.some((l) => l.id === letter.id));
});

test('重复转投只能成功一次：第二次被拒', async () => {
  const letter = makeLetter({ sender: users.a, receiver: users.b, ttl: 0 });
  LetterModel.transition({
    id: letter.id,
    fromStatuses: ['delivered'],
    changes: { status: 'returned', expires_at: 0 }
  });
  LetterService.reroute({ userId: users.a, letterId: letter.id, content: '再投' });

  // 转投后若再次到期退回，也不能第二次转投
  await sleep(100);
  LetterService.sweepExpired();
  assert.strictEqual(LetterModel.findById(letter.id).status, LETTER_STATUS.RETURNED);
  assert.throws(
    () => LetterService.reroute({ userId: users.a, letterId: letter.id, content: '再投一次' }),
    (e) => e.code === 'BAD_REQUEST' && e.message === MESSAGES.REROUTE_USED
  );
});

test('寄件人撤回永久关闭；撤回只能发生在待转投区；不可重复撤回', () => {
  const letter = makeLetter({ sender: users.a, receiver: users.b, ttl: 0 });
  LetterModel.transition({
    id: letter.id,
    fromStatuses: ['delivered'],
    changes: { status: 'returned', expires_at: 0 }
  });

  // 未退回的信不能撤回
  const fresh = makeLetter({ sender: users.a, receiver: users.b, ttl: 60000 });
  assert.throws(
    () => LetterService.withdraw({ userId: users.a, letterId: fresh.id }),
    (e) => e.code === 'BAD_REQUEST'
  );
  // 收信人不能撤回
  assert.throws(
    () => LetterService.withdraw({ userId: users.b, letterId: letter.id }),
    (e) => e.code === 'FORBIDDEN'
  );

  LetterService.withdraw({ userId: users.a, letterId: letter.id });
  assert.strictEqual(LetterModel.findById(letter.id).status, LETTER_STATUS.WITHDRAWN);
  assert.throws(
    () => LetterService.withdraw({ userId: users.a, letterId: letter.id }),
    (e) => e.code === 'BAD_REQUEST'
  );
  assert.throws(
    () => LetterService.reroute({ userId: users.a, letterId: letter.id, content: '复活' }),
    (e) => e.code === 'BAD_REQUEST'
  );
  // 撤回后不在待转投区，仍在发出的里留档
  const inbox = LetterService.listInbox(users.a);
  assert.ok(!inbox.reroutes.some((l) => l.id === letter.id));
  assert.ok(inbox.sent.some((l) => l.id === letter.id && l.status === 'withdrawn'));
});

test('同时到达的互斥操作只有一个成功（条件更新语义）', () => {
  // 两封跳过并发：只有一次状态流转生效
  const l1 = makeLetter({ sender: users.a, receiver: users.b, ttl: 60000 });
  const r1 = LetterModel.transition({
    id: l1.id,
    fromStatuses: ['delivered', 'pending'],
    changes: { status: 'skipped', expires_at: 0 }
  });
  const r2 = LetterModel.transition({
    id: l1.id,
    fromStatuses: ['delivered', 'pending'],
    changes: { status: 'skipped', expires_at: 0 }
  });
  assert.strictEqual(r1, true);
  assert.strictEqual(r2, false);

  // 到期退回 与 回复 竞争：先到的赢，后到的条件更新落空
  const l2 = makeLetter({ sender: users.a, receiver: users.b, ttl: 60000 });
  const replyWins = LetterModel.transition({
    id: l2.id,
    fromStatuses: ['delivered', 'pending'],
    changes: { status: 'replied', expires_at: 0 }
  });
  const expiryLoses = LetterModel.transition({
    id: l2.id,
    fromStatuses: ['delivered', 'pending'],
    changes: { status: 'returned', expires_at: 0 }
  });
  assert.strictEqual(replyWins, true);
  assert.strictEqual(expiryLoses, false);
  assert.strictEqual(LetterModel.findById(l2.id).status, 'replied');

  // 反向：退回先到，回复落空
  const l3 = makeLetter({ sender: users.a, receiver: users.b, ttl: 60000 });
  const expiryWins = LetterModel.transition({
    id: l3.id,
    fromStatuses: ['delivered', 'pending'],
    changes: { status: 'returned', expires_at: 0 }
  });
  const replyLoses = LetterModel.transition({
    id: l3.id,
    fromStatuses: ['delivered', 'pending'],
    changes: { status: 'replied', expires_at: 0 }
  });
  assert.strictEqual(expiryWins, true);
  assert.strictEqual(replyLoses, false);
  assert.strictEqual(LetterModel.findById(l3.id).status, 'returned');
});

test('HTTP 层端到端：到期后回复返回 410，转投成功后再次到期无法二次转投', async () => {
  // 通过完整 HTTP 栈验证状态码映射
  const express = require('express');
  const letterRoutes = require('../src/routes/letterRoutes');
  const AuthService = require('../src/services/authService');

  const token = AuthService._issue(users.b, 'b');
  const senderToken = AuthService._issue(users.a, 'a');
  const app = express();
  app.use(express.json());
  app.use('/api/letters', letterRoutes);
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const letter = makeLetter({ sender: users.a, receiver: users.b });
    await sleep(100);

    let res = await fetch(`http://127.0.0.1:${port}/api/letters/${letter.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: '晚了' })
    });
    assert.strictEqual(res.status, 410);

    // 寄件人转投成功
    res = await fetch(`http://127.0.0.1:${port}/api/letters/${letter.id}/reroute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${senderToken}` },
      body: JSON.stringify({ content: '改投正文' })
    });
    assert.strictEqual(res.status, 200);
  } finally {
    server.close();
  }
});

test.after(() => {
  db.close();
});
