import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LABELS, ROUTES } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';

export default function ReroutePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [letter, setLetter] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await LetterApi.reroute(id);
        if (!alive) return;
        setLetter(data);
        setContent(data.content);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const submit = async () => {
    setError('');
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await LetterApi.submitReroute(id, content.trim());
      navigate(ROUTES.INBOX);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async () => {
    if (!window.confirm(LABELS.WITHDRAW_CONFIRM)) return;
    try {
      await LetterApi.withdraw(id);
      navigate(ROUTES.INBOX);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="loading">加载信件中…</div>;
  if (!letter) return <div className="empty-state">{error || '信件不可转投'}</div>;

  return (
    <div className="thread-wrap">
      <div className="thread-head">
        <h2>转投信件 #{id}</h2>
        <button className="icon-btn" onClick={() => navigate(-1)}>
          {LABELS.BACK}
        </button>
      </div>

      <p className="reroute-hint">
        {letter.canReroute ? LABELS.REROUTE_HINT : LABELS.REROUTE_USED_HINT}
      </p>

      <div className="reply-box">
        <textarea
          className="reply-text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={2000}
          disabled={!letter.canReroute}
        />
        <div className="reply-footer">
          <div className="error-text" style={{ margin: 'auto 0' }}>{error}</div>
          {letter.canReroute ? (
            <button
              className="big-btn"
              onClick={submit}
              disabled={submitting || !content.trim()}
            >
              {submitting ? LABELS.REROUTING : LABELS.REROUTE_SUBMIT}
            </button>
          ) : (
            <button className="big-btn danger" onClick={withdraw}>
              {LABELS.WITHDRAW}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
