import { api } from './http.js';
import { ENDPOINTS } from '../config/constants.js';

export const LetterApi = {
  send({ content }) {
    return api.request(ENDPOINTS.SEND_LETTER, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  },
  reply({ id, content }) {
    return api.request(ENDPOINTS.REPLY_LETTER(id), {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  },
  skip(id) {
    return api.request(ENDPOINTS.SKIP_LETTER(id), { method: 'POST' });
  },
  // 限时转投：content 可省略（保留原正文）
  forward(id, content) {
    return api.request(ENDPOINTS.FORWARD_LETTER(id), {
      method: 'POST',
      body: JSON.stringify(content ? { content } : {})
    });
  },
  withdraw(id) {
    return api.request(ENDPOINTS.WITHDRAW_LETTER(id), { method: 'POST' });
  },
  toggleFavorite(id) {
    return api.request(ENDPOINTS.FAVORITE_LETTER(id), { method: 'POST' });
  },
  thread(id) {
    return api.request(ENDPOINTS.THREAD(id));
  },
  inbox() {
    return api.request(ENDPOINTS.INBOX);
  }
};
