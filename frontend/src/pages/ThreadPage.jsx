import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LABELS, formatRemaining } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ThreadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const thread = await LetterApi.thread(id);
      setData(thread);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const submitReply = async () => {
    setError('');
    if (!reply.trim()) return;
    setSubmitting(true);
    try {
      await LetterApi.reply({ id, content: reply.trim() });
      setReply('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFavorite = async () => {
    try {
      await LetterApi.toggleFavorite(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="loading">加载对话中…</div>;
  if (!data) return <div className="empty-state">{error || '无法加载对话'}</div>;

  // 只有仍在 72h 处理时限内的"已送达"信，才允许首封回复
  const live = data.status === 'delivered' && data.expiresAt && data.expiresAt > now;
  const inConversation = data.status === 'replied';
  const canReply = live || inConversation;

  return (
    <div className="thread-wrap">
      <div className="thread-head">
        <h2>对话链 #{id}</h2>
        <div>
          <button
            className={`icon-btn ${data.favorited ? 'on' : ''}`}
            onClick={toggleFavorite}
          >
            {data.favorited ? `★ ${LABELS.UNFAVORITE}` : `☆ ${LABELS.FAVORITE}`}
          </button>
          <button
            className="icon-btn"
            style={{ marginLeft: 8 }}
            onClick={() => navigate(-1)}
          >
            {LABELS.BACK}
          </button>
        </div>
      </div>

      {live && (
        <div className="deadline-bar">
          收信处理时限 {formatRemaining(data.expiresAt - now)}，超时未回复也未跳过，信件将退回寄件人
        </div>
      )}

      <div className="message-list">
        {data.messages.map((m) => (
          <div key={m.id} className={`msg-bubble ${m.fromMe ? 'me' : 'them'}`}>
            <div>{m.content}</div>
            <div className="msg-time">{formatTime(m.createdAt)}</div>
          </div>
        ))}
      </div>

      {canReply ? (
        <div className="reply-box">
          <textarea
            className="reply-text"
            placeholder={LABELS.REPLY_PLACEHOLDER}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={2000}
          />
          <div className="reply-footer">
            <div className="error-text" style={{ margin: 'auto 0' }}>{error}</div>
            <button
              className="big-btn"
              onClick={submitReply}
              disabled={submitting || !reply.trim()}
            >
              {submitting ? '寄出中…' : LABELS.SUBMIT_REPLY}
            </button>
          </div>
        </div>
      ) : (
        <div className="reply-box closed-box">
          {error ? <span className="error-text">{error}</span> : '这封信的处理时限已过，回复入口已关闭。'}
        </div>
      )}
    </div>
  );
}
