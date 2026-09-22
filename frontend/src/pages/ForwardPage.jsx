import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LABELS } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ForwardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const thread = await LetterApi.thread(id);
      setData(thread);
      // 正文保留：默认填入原信内容，寄件人可在此基础上修改
      setContent(thread.messages[0]?.content || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const submit = async (keepOriginal) => {
    setError('');
    setBusy(true);
    try {
      await LetterApi.forward(id, keepOriginal ? undefined : content.trim());
      navigate('/inbox');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setError('');
    if (!window.confirm(LABELS.CONFIRM_WITHDRAW)) return;
    setBusy(true);
    try {
      await LetterApi.withdraw(id);
      navigate('/inbox');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (loading) return <div className="loading">加载待转投信件中…</div>;
  if (!data) return <div className="empty-state">{error || '无法加载信件'}</div>;

  return (
    <div className="compose-wrap">
      <h2 className="compose-title">转投信件 #{id}</h2>
      <p className="compose-hint">{LABELS.FORWARD_HINT}</p>

      <div className="message-list">
        {data.messages.map((m) => (
          <div key={m.id} className={`msg-bubble ${m.fromMe ? 'me' : 'them'}`}>
            <div>{m.content}</div>
            <div className="msg-time">{formatTime(m.createdAt)}</div>
          </div>
        ))}
      </div>

      <textarea
        className="compose-text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={LABELS.CONTENT_PLACEHOLDER}
        maxLength={2000}
      />
      <div className="compose-footer">
        <span className="count">{content.length} / 2000</span>
        <div>
          <button
            className="secondary-btn"
            style={{ marginRight: 10 }}
            onClick={withdraw}
            disabled={busy}
          >
            {LABELS.WITHDRAW}（永久关闭）
          </button>
          <button
            className="secondary-btn"
            style={{ marginRight: 10 }}
            onClick={() => submit(true)}
            disabled={busy}
          >
            {LABELS.FORWARD_KEEP}
          </button>
          <button
            className="big-btn"
            onClick={() => submit(false)}
            disabled={busy || !content.trim()}
          >
            {busy ? LABELS.FORWARD_SENDING : LABELS.FORWARD_SEND}
          </button>
        </div>
      </div>
      <div className="error-text">{error}</div>
    </div>
  );
}
