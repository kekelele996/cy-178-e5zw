/**
 * 限时转投功能的端到端业务测试（不经过 HTTP，直接跑 service 层）
 * 用临时数据库、缩短的回复时限，跑完即删。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-test-'));
process.env.SQLITE_PATH = path.join(tmpDir, 'test.db');
process.env.REPLY_WINDOW_MS = String(72 * 60 * 60 * 1000); // 72 小时，测试里手动拨时钟

const UserModel = require('../src/models/userModel');
const LetterModel = require('../src/models/letterModel');
const FavoriteModel = require('../src/models/favoriteModel');
const LetterService = require('../src/services/letterService');
const { LETTER_STATUS, MESSAGES } = require('../src/config/constants');

function mkUser(name) {
  return UserModel.create({
    penName: name,
    passwordHash: 'x',
    createdAt: Date.now()
  });
}

function expectThrow(fn, code) {
  try {
    fn();
  } catch (err) {
    assert.strictEqual(err.code, code, `期望错误码 ${code}，实际 ${err.code}(${err.message})`);
    return;
  }
  throw new Error(`期望抛出 ${code}，但没有`);
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const HOUR = 60 * 60 * 1000;

// 把一封信的到期时间拨到 hoursAgo 小时前（模拟时间流逝）
function age(letterId, hoursAgo) {
  const db = require('../src/data/database');
  const expiresAt = Date.now() - Math.abs(hoursAgo) * HOUR;
  db.prepare('UPDATE letters SET expires_at = ? WHERE id = ?').run(expiresAt, letterId);
}

const users = {};
['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach((n) => { users[n] = mkUser('user_' + n); });

// ---------- 基础流转：72h 到期 → 待转投 ----------
const letter = LetterService.sendRandom({ senderId: users.a, content: '你好，陌生人' });
assert.ok(letter.id);
assert.strictEqual(letter.status, LETTER_STATUS.DELIVERED);
assert.ok(letter.expires_at > Date.now() + 71 * HOUR, '初始时限应为 72 小时');
const firstReceiverId = letter.receiver_id;
assert.ok(firstReceiverId !== users.a);
const receiverKey = Object.keys(users).find((k) => users[k] === firstReceiverId);
const otherKey = ['b', 'c', 'd', 'e'].find((k) => k !== receiverKey);
const otherId = users[otherKey];

test('未到期时寄件人不能转投（转投只能在到期后）', () => {
  expectThrow(
    () => LetterService.forward({ userId: users.a, letterId: letter.id }),
    'NOT_WAITING'
  );
});

test('未到期时寄件人不能撤回（撤回只在待转投区）', () => {
  expectThrow(
    () => LetterService.withdraw({ userId: users.a, letterId: letter.id }),
    'CONFLICT'
  );
});

test('无关用户无权操作', () => {
  expectThrow(
    () => LetterService.skip({ userId: otherId, letterId: letter.id }),
    'FORBIDDEN'
  );
  expectThrow(
    () => LetterService.getThread({ userId: otherId, rootId: letter.id }),
    'FORBIDDEN'
  );
});

test('收信人可以收藏', () => {
  const r = LetterService.toggleFavorite({ userId: firstReceiverId, letterId: letter.id });
  assert.strictEqual(r.favorited, true);
});

// 到期：跳过/回复窗口关闭（72 小时后）
age(letter.id, -73);

test('过期后回复失败', () => {
  // sweep 先把信收到待转投区、隐藏收信信息，原收信人入口立即作废
  expectThrow(
    () => LetterService.reply({
      userId: firstReceiverId,
      parentId: letter.id,
      content: '晚来的回信'
    }),
    'EXPIRED'
  );
});

test('过期后跳过失败', () => {
  expectThrow(
    () => LetterService.skip({ userId: firstReceiverId, letterId: letter.id }),
    'EXPIRED'
  );
});

test('到期扫描后信件进入待转投区、收信信息隐藏、正文保留', () => {
  LetterService.sweepExpired();
  const row = LetterModel.findById(letter.id);
  assert.strictEqual(row.status, LETTER_STATUS.AWAITING_FORWARD);
  assert.strictEqual(row.receiver_id, null);
  assert.strictEqual(row.content, '你好，陌生人');
  assert.strictEqual(row.previous_receiver_id, firstReceiverId);
});

test('原收信人的收藏已作废', () => {
  assert.strictEqual(
    FavoriteModel.exists({ userId: firstReceiverId, letterId: letter.id }),
    false
  );
});

test('原收信人的操作入口立即作废（查看/收藏/跳过/回复全部拒绝）', () => {
  // 查看与收藏入口：不可见
  expectThrow(
    () => LetterService.getThread({ userId: firstReceiverId, rootId: letter.id }),
    'FORBIDDEN'
  );
  expectThrow(
    () => LetterService.toggleFavorite({ userId: firstReceiverId, letterId: letter.id }),
    'EXPIRED'
  );
  // 跳过与回复：入口已过期失效
  expectThrow(
    () => LetterService.skip({ userId: firstReceiverId, letterId: letter.id }),
    'EXPIRED'
  );
  expectThrow(
    () => LetterService.reply({
      userId: firstReceiverId,
      parentId: letter.id,
      content: 'x'
    }),
    'EXPIRED'
  );
});

test('待转投区只对寄件人可见，且不在"收到的/发出的"列表里', () => {
  const inboxA = LetterService.listInbox(users.a);
  assert.ok(inboxA.awaitingForward.some((l) => l.id === letter.id));
  assert.ok(!inboxA.sent.some((l) => l.id === letter.id));
  const inboxR = LetterService.listInbox(firstReceiverId);
  assert.strictEqual(inboxR.awaitingForward.length, 0);
  assert.ok(!inboxR.received.some((l) => l.id === letter.id));
});

// ---------- 转投 ----------
test('转投不会回到寄件人或原收信人', () => {
  // 多试几轮（只有 4 个用户时可选的只有 2 个）
  for (let i = 0; i < 10; i++) {
    const pick = require('../src/models/userModel').findRandomOtherExcept(users.a, [firstReceiverId]);
    assert.notStrictEqual(pick.id, users.a);
    assert.notStrictEqual(pick.id, firstReceiverId);
  }
});

const forwarded = LetterService.forward({
  userId: users.a,
  letterId: letter.id,
  content: '修改后的正文'
});
test('转投成功：重新计时 72h、新收信人、正文更新、计数=1', () => {
  assert.strictEqual(forwarded.status, LETTER_STATUS.DELIVERED);
  assert.strictEqual(forwarded.content, '修改后的正文');
  assert.strictEqual(forwarded.forward_count, 1);
  assert.ok(forwarded.expires_at > Date.now() + 71 * HOUR);
  assert.notStrictEqual(forwarded.receiver_id, users.a);
  assert.notStrictEqual(forwarded.receiver_id, firstReceiverId);
  // 收信信息对寄件人依然不可见（API 层从不返回收信人身份）
});

const newReceiverId = forwarded.receiver_id;

test('转投后不能重复转投', () => {
  expectThrow(
    () => LetterService.forward({ userId: users.a, letterId: letter.id }),
    'NOT_WAITING'
  );
});

test('转投后原收信人依然无入口（即使新信未到期）', () => {
  expectThrow(
    () => LetterService.getThread({ userId: firstReceiverId, rootId: letter.id }),
    'FORBIDDEN'
  );
});

test('转投后的新收信人可以回复，回复形成对话链', () => {
  const reply = LetterService.reply({
    userId: newReceiverId,
    parentId: letter.id,
    content: '收到啦'
  });
  const row = LetterModel.findById(letter.id);
  assert.strictEqual(row.status, LETTER_STATUS.REPLIED);
  assert.strictEqual(reply.parent_id, letter.id);
  // 回复后计时器作废
  assert.strictEqual(row.expires_at, null);
});

test('对话中双向回复的收信人始终正确', () => {
  // 寄件人回给当前收信人
  const back = LetterService.reply({
    userId: users.a,
    parentId: letter.id,
    content: '再聊一句'
  });
  assert.strictEqual(back.sender_id, users.a);
  assert.strictEqual(back.receiver_id, newReceiverId);
  // 收信人再回给寄件人
  const again = LetterService.reply({
    userId: newReceiverId,
    parentId: letter.id,
    content: '好的'
  });
  assert.strictEqual(again.sender_id, newReceiverId);
  assert.strictEqual(again.receiver_id, users.a);
});

test('回复后即使拨过到期时间也不会被扫描收走', () => {
  age(letter.id, -100);
  LetterService.sweepExpired();
  const row = LetterModel.findById(letter.id);
  assert.strictEqual(row.status, LETTER_STATUS.REPLIED);
  assert.notStrictEqual(row.receiver_id, null);
});

// ---------- 第二封信：撤回永久关闭 ----------
const letter2 = LetterService.sendRandom({ senderId: users.a, content: '第二封' });
age(letter2.id, -73);
LetterService.sweepExpired();
assert.strictEqual(LetterModel.findById(letter2.id).status, LETTER_STATUS.AWAITING_FORWARD);

test('撤回后永久关闭', () => {
  LetterService.withdraw({ userId: users.a, letterId: letter2.id });
  const row = LetterModel.findById(letter2.id);
  assert.strictEqual(row.status, LETTER_STATUS.WITHDRAWN);
  assert.strictEqual(row.receiver_id, null);
  // 撤回后不能再转投
  expectThrow(
    () => LetterService.forward({ userId: users.a, letterId: letter2.id }),
    'NOT_WAITING'
  );
  // 重复撤回也失败
  expectThrow(
    () => LetterService.withdraw({ userId: users.a, letterId: letter2.id }),
    'CONFLICT'
  );
});

// ---------- 第三封信：转投后再次到期 → 自动永久关闭，不能第二次转投 ----------
const letter3 = LetterService.sendRandom({ senderId: users.a, content: '第三封' });
age(letter3.id, -73);
LetterService.sweepExpired();
LetterService.forward({ userId: users.a, letterId: letter3.id });
age(letter3.id, -73);
LetterService.sweepExpired();
test('转投过的信再次到期自动关闭，不能再转投', () => {
  const row = LetterModel.findById(letter3.id);
  assert.strictEqual(row.status, LETTER_STATUS.CLOSED);
  assert.strictEqual(row.receiver_id, null);
  expectThrow(
    () => LetterService.forward({ userId: users.a, letterId: letter3.id }),
    'NOT_WAITING'
  );
});

// ---------- 第四封信：跳过不会进入转投流程 ----------
const letter4 = LetterService.sendRandom({ senderId: users.a, content: '第四封' });
const r4 = letter4.receiver_id;
LetterService.skip({ userId: r4, letterId: letter4.id });
age(letter4.id, -200);
test('已跳过的信到期扫描不动它', () => {
  LetterService.sweepExpired();
  assert.strictEqual(LetterModel.findById(letter4.id).status, LETTER_STATUS.SKIPPED);
});

test('重复跳过只有一个成功', () => {
  expectThrow(() => LetterService.skip({ userId: r4, letterId: letter4.id }), 'CONFLICT');
});

// ---------- 第五封信：回复与跳过竞争，只有一个成功 ----------
test('回复先到则跳过失败', () => {
  const letter5 = LetterService.sendRandom({ senderId: users.a, content: '第五封' });
  const r5 = letter5.receiver_id;
  LetterService.reply({ userId: r5, parentId: letter5.id, content: '先到的回复' });
  expectThrow(
    () => LetterService.skip({ userId: r5, letterId: letter5.id }),
    'CONFLICT'
  );
});

// 反过来：跳过先到则回复失败
test('跳过先到则回复失败（入口已失效）', () => {
  const letter6 = LetterService.sendRandom({ senderId: users.a, content: '第六封' });
  const r6 = letter6.receiver_id;
  LetterService.skip({ userId: r6, letterId: letter6.id });
  expectThrow(
    () => LetterService.reply({ userId: r6, parentId: letter6.id, content: '晚到的回复' }),
    'EXPIRED'
  );
});

// ---------- 待转投时转投与撤回竞争 ----------
test('转投与撤回同时发生时只有一个成功（转投先到）', () => {
  const letter7 = LetterService.sendRandom({ senderId: users.a, content: '第七封' });
  age(letter7.id, -73);
  LetterService.sweepExpired();
  const wonForward = LetterModel.forward({
    letterId: letter7.id,
    senderId: users.a,
    newReceiverId: users.h,
    content: '竞争转投',
    expiresAt: Date.now() + 72 * HOUR
  });
  assert.ok(wonForward);
  expectThrow(
    () => LetterService.withdraw({ userId: users.a, letterId: letter7.id }),
    'CONFLICT'
  );
});

// ---------- 转投保留原正文（不传 content）----------
test('转投时不改正文则保留原正文', () => {
  const letter8 = LetterService.sendRandom({ senderId: users.a, content: '保持原样的正文' });
  age(letter8.id, -73);
  LetterService.sweepExpired();
  const f8 = LetterService.forward({ userId: users.a, letterId: letter8.id });
  assert.strictEqual(f8.content, '保持原样的正文');
});

// ---------- 旧收信人曾收藏 → 新收信人视角独立 ----------
test('旧收藏作废后，新收信人可独立收藏', () => {
  const letter9 = LetterService.sendRandom({ senderId: users.a, content: '第九封' });
  const r9 = letter9.receiver_id;
  LetterService.toggleFavorite({ userId: r9, letterId: letter9.id });
  age(letter9.id, -73);
  LetterService.sweepExpired();
  const f9 = LetterService.forward({ userId: users.a, letterId: letter9.id, content: '第九封转投' });
  const favByNew = LetterService.toggleFavorite({ userId: f9.receiver_id, letterId: letter9.id });
  assert.strictEqual(favByNew.favorited, true);
  assert.strictEqual(FavoriteModel.exists({ userId: r9, letterId: letter9.id }), false);
});

console.log(`\n全部 ${passed} 项测试通过 ✅`);
