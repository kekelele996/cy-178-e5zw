import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LABELS,
  STATUS_TEXT,
  formatRemaining
} from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';

const TABS = [
  { key: 'received', label: LABELS.RECEIVED },
  { key: 'sent', label: LABELS.SENT },
  { key: 'awaitingForward', label: LABELS.AWAITING_FORWARD },
  { key: 'conversations', label: LABELS.CONVERSATIONS }
];

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 每秒刷新一次倒计时
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function StatusBadge({ item }) {
  if (item.status === 'delivered') {
    if (item.role === 'received' && item.expiresAt) {
      return <span className="badge timer">{formatRemaining(item.expiresAt - Date.now())}</span>;
    }
    return null;
  }
  const cls =
    item.status === 'skipped' || item.status === 'withdrawn' || item.status === 'closed'
      ? 'badge skipped'
      : 'badge waiting';
  return <span className={cls}>{STATUS_TEXT[item.status] || item.status}</span>;
}

function LetterCard({ tab, item, onOpen, onToggleFavorite, onSkip, onForward, onWithdraw }) {
  const now = useNow();
  const isWaiting = tab === 'awaitingForward';

  return (
    <div className="letter-card" onClick={() => onOpen(item.id, isWaiting)}>
      <div className="letter-meta">
        <span>
          {isWaiting || item.role === 'sent' ? LABELS.SENT_FROM_ME : LABELS.SENT_FROM_STRANGER}
          {item.replyCount > 0 ? ` · ${item.replyCount} 封回信` : ''}
          {item.forwardCount > 0 ? ' · 已转投' : ''}
        </span>
        <span>
          {formatTime(item.createdAt)} <StatusBadge item={{ ...item, _now: now }} />
        </span>
      </div>
      <div className="letter-preview">
        {item.preview}{item.preview.length >= 80 ? '…' : ''}
      </div>

      {isWaiting && (
        <div className="forward-note">收信信息已隐藏，正文保留。转投只有一次机会。</div>
      )}

      <div className="letter-actions" onClick={(e) => e.stopPropagation()}>
        {!isWaiting && (
          <button
            className={`icon-btn ${item.favorited ? 'on' : ''}`}
            onClick={() => onToggleFavorite(item.id)}
          >
            {item.favorited ? `★ ${LABELS.UNFAVORITE}` : `☆ ${LABELS.FAVORITE}`}
          </button>
        )}
        {tab === 'received' && item.status === 'delivered' && item.replyCount === 0 && (
          <button className="icon-btn" onClick={() => onSkip(item.id)}>
            {LABELS.SKIP}
          </button>
        )}
        {isWaiting && (
          <>
            <button className="icon-btn primary" onClick={() => onForward(item.id)}>
              {LABELS.FORWARD}
            </button>
            <button className="icon-btn danger" onClick={() => onWithdraw(item.id)}>
              {LABELS.WITHDRAW}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function InboxPage() {
  const [tab, setTab] = useState('received');
  const [data, setData] = useState({
    sent: [],
    received: [],
    conversations: [],
    awaitingForward: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const refresh = async () => {
    try {
      const result = await LetterApi.inbox();
      setData(result);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // 待转投区有新信件时角标提示
  const waitingCount = data.awaitingForward?.length || 0;

  const toggleFavorite = async (id) => {
    try {
      await LetterApi.toggleFavorite(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const skip = async (id) => {
    try {
      await LetterApi.skip(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const open = (id, isWaiting) => {
    if (isWaiting) navigate(`/forward/${id}`);
    else navigate(`/thread/${id}`);
  };

  const forward = (id) => navigate(`/forward/${id}`);

  const withdraw = async (id) => {
    if (!window.confirm(LABELS.CONFIRM_WITHDRAW)) return;
    try {
      await LetterApi.withdraw(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const list = data[tab] || [];

  const emptyText = useMemo(() => {
    if (tab === 'sent') return LABELS.EMPTY_SENT;
    if (tab === 'received') return LABELS.EMPTY_RECEIVED;
    if (tab === 'awaitingForward') return LABELS.EMPTY_AWAITING;
    return LABELS.EMPTY_CONVERSATIONS;
  }, [tab]);

  return (
    <div>
      <div className="inbox-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === 'awaitingForward' && waitingCount > 0 && (
              <span className="tab-count">{waitingCount}</span>
            )}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="loading">加载中…</div>
      ) : list.length === 0 ? (
        <div className="empty-state">{emptyText}</div>
      ) : (
        <div className="letter-list">
          {list.map((item) => (
            <LetterCard
              key={item.id}
              tab={tab}
              item={item}
              onOpen={open}
              onToggleFavorite={toggleFavorite}
              onSkip={skip}
              onForward={forward}
              onWithdraw={withdraw}
            />
          ))}
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
