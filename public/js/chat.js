const OBUNTO_CHAT = (() => {
  let currentRoomId = null;
  let previousRoomId = null;
  let listenerBound = false;
  let statusListenerBound = false;
  let typingTimer = null;

  function appendMessage(msg) {
    const log = qs('#chat-log');
    const row = ce('div', 'chat-message');
    const meta = ce('div', 'chat-message__meta');
    const author = ce('span', 'chat-message__author');
    author.textContent = msg.profile ? msg.profile.username : 'desconhecido';
    author.style.color = msg.profile ? msg.profile.color : 'inherit';
    const time = ce('span', 'chat-message__time');
    const date = new Date(msg.ts || Date.now());
    time.textContent = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    meta.appendChild(author);
    meta.appendChild(time);
    const text = ce('div', 'chat-message__text');
    text.textContent = msg.text;
    row.appendChild(meta);
    row.appendChild(text);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function renderHistory(list) {
    const log = qs('#chat-log');
    log.innerHTML = '';
    (list || []).forEach(appendMessage);
  }

  function setStatus(state) {
    const el = qs('#chat-status');
    if (!el) return;
    el.dataset.state = state;
    el.textContent = state === 'online' ? 'SINAL ATIVO' : state === 'connecting' ? 'CONECTANDO...' : 'SEM SINAL';
  }

  function setTypingLabel(text) {
    const el = qs('#chat-typing');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('hidden', !text);
  }

  function bindStatusListeners() {
    if (statusListenerBound) return;
    statusListenerBound = true;
    OBUNTO_SIGNAL.on('connected', () => {
      setStatus('online');
      if (currentRoomId) OBUNTO_SIGNAL.join(currentRoomId, OBUNTO_STORE.getToken());
    });
    OBUNTO_SIGNAL.on('disconnected', () => setStatus('offline'));
    OBUNTO_SIGNAL.on('auth-error', () => setStatus('offline'));
  }

  async function openChannel(channel) {
    previousRoomId = currentRoomId;
    currentRoomId = 'text:' + channel.id;

    qs('#channel-title').textContent = '#' + channel.name;
    qs('#chat-log').innerHTML = '';
    setTypingLabel('');
    qs('#view-voice').classList.add('hidden');
    qs('#view-chat').classList.remove('hidden');

    bindStatusListeners();
    setStatus(OBUNTO_SIGNAL.isReady() ? 'online' : 'connecting');

    if (!listenerBound) {
      OBUNTO_SIGNAL.on('chat', msg => {
        if (msg.roomId === currentRoomId) appendMessage(msg);
      });
      OBUNTO_SIGNAL.on('joined', msg => {
        if (msg.roomId === currentRoomId && Array.isArray(msg.history)) {
          renderHistory(msg.history);
        }
      });
      OBUNTO_SIGNAL.on('typing', msg => {
        if (msg.roomId !== currentRoomId || !msg.profile) return;
        setTypingLabel(msg.profile.username + ' está digitando...');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => setTypingLabel(''), 2500);
      });
      listenerBound = true;
    }

    try {
      await OBUNTO_SIGNAL.connect();
      setStatus('online');
    } catch (e) {
      setStatus('offline');
    }

    if (previousRoomId && previousRoomId !== currentRoomId) {
      OBUNTO_SIGNAL.leave(previousRoomId);
    }

    OBUNTO_SIGNAL.join(currentRoomId, OBUNTO_STORE.getToken());
  }

  function sendMessage() {
    const input = qs('#chat-text');
    const text = input.value.trim();
    if (!text || !currentRoomId) return;
    OBUNTO_SIGNAL.chat(currentRoomId, text);
    input.value = '';
    input.focus();
  }

  function init() {
    qs('#chat-send').addEventListener('click', sendMessage);
    qs('#chat-text').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });
    let lastTypingSent = 0;
    qs('#chat-text').addEventListener('input', () => {
      if (!currentRoomId) return;
      const now = Date.now();
      if (now - lastTypingSent < 1500) return;
      lastTypingSent = now;
      OBUNTO_SIGNAL.typing(currentRoomId);
    });
  }

  return { init, openChannel };
})();
