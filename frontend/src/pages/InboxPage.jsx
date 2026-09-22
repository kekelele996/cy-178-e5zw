import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LABELS, STATUS_TEXT } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';

const TABS = [
  { key: 'received', label: LABELS.RECEIVED },
  { key: 'sent', label: LABELS.SENT },
  { key: 'conversations', label: LABELS.CONVERSATIONS },
  { key: 'reroutes', label: LABELS.REROUTES }
];

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeLeft(expiresAt, now) {
  const ms = expiresAt - now;
  if (ms <= 0) return null;
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  return LABELS.TIME_LEFT(hours);
}

function StatusBadge({ item }) {
  if (item.status === 'delivered' && item.rerouteCount > 0) {
    return <span className="badge">{STATUS_TEXT.rerouted}</span>;
  }
  const hidden = ['delivered', 'pending'].includes(item.status);
  if (hidden) return null;
  const cls = ['skipped', 'returned', 'withdrawn'].includes(item.status)
    ? 'badge skipped'
    : 'badge';
  return <span className={cls}>{STATUS_TEXT[item.status]}</span>;
}

function LetterCard({ item, tab, now, onOpen, onToggleFavorite, onSkip, onWithdraw }) {
  const isRerouteTab = tab === 'reroutes';
  const countdown =
    tab === 'received' && item.expiresAt ? timeLeft(item.expiresAt, now) : null;

  return (
    <div className="letter-card" onClick={() => onOpen(item)}>
      <div className="letter-meta">
        <span>
          {isRerouteTab
            ? LABELS.RETURNED_HINT
            : item.role === 'sent'
              ? LABELS.SENT_FROM_ME
              : LABELS.SENT_FROM_STRANGER}
          {item.replyCount > 0 ? ` · ${item.replyCount} 封回信` : ''}
        </span>
        <span>
          {formatTime(item.createdAt)} <StatusBadge item={item} />
          {countdown && <em className="countdown"> · {countdown}</em>}
        </span>
      </div>
      <div className="letter-preview">
        {item.preview}
        {item.preview.length >= 80 ? '…' : ''}
      </div>
      <div className="letter-actions" onClick={(e) => e.stopPropagation()}>
        {isRerouteTab ? (
          <>
            <button
              className="icon-btn primary"
              onClick={() => onOpen(item)}
            >
              ✎ {LABELS.REROUTE_SUBMIT}
            </button>
            <button className="icon-btn danger" onClick={() => onWithdraw(item.id)}>
              {LABELS.WITHDRAW}
            </button>
          </>
        ) : (
          <>
            <button
              className={`icon-btn ${item.favorited ? 'on' : ''}`}
              onClick={() => onToggleFavorite(item.id)}
            >
              {item.favorited ? `★ ${LABELS.UNFAVORITE}` : `☆ ${LABELS.FAVORITE}`}
            </button>
            {tab === 'received' && item.status !== 'skipped' && item.replyCount === 0 && (
              <button className="icon-btn" onClick={() => onSkip(item.id)}>
                {LABELS.SKIP}
              </button>
            )}
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
    reroutes: []
  });
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const refresh = async () => {
    try {
      const result = await LetterApi.inbox();
      setData(result);
      setNow(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

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

  const withdraw = async (id) => {
    if (!window.confirm(LABELS.WITHDRAW_CONFIRM)) return;
    try {
      await LetterApi.withdraw(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const openLetter = (item) => {
    if (tab === 'reroutes') {
      navigate(`/reroute/${item.id}`);
    } else {
      navigate(`/thread/${item.id}`);
    }
  };

  const list = data[tab] || [];

  const emptyText = useMemo(() => {
    if (tab === 'sent') return LABELS.EMPTY_SENT;
    if (tab === 'received') return LABELS.EMPTY_RECEIVED;
    if (tab === 'reroutes') return LABELS.EMPTY_REROUTES;
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
            {t.key === 'reroutes' && data.reroutes.length > 0
              ? ` (${data.reroutes.length})`
              : ''}
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
              item={item}
              tab={tab}
              now={now}
              onOpen={openLetter}
              onToggleFavorite={toggleFavorite}
              onSkip={skip}
              onWithdraw={withdraw}
            />
          ))}
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
