const OBUNTO_SIGNAL = (() => {
  let ws = null;
  let ready = false;
  let connecting = null;
  let manualClose = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  const queue = [];
  const handlers = {};

  function on(type, fn) {
    if (!handlers[type]) handlers[type] = [];
    handlers[type].push(fn);
  }

  function emit(type, data) {
    (handlers[type] || []).forEach(fn => fn(data));
  }

  function scheduleReconnect() {
    if (manualClose) return;
    reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(1.6, reconnectAttempts), 8000);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connect();
    }, delay);
  }

  function connect() {
    if (ready) return Promise.resolve();
    if (connecting) return connecting;
    manualClose = false;
    connecting = new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        connecting = null;
        try {
          ws.close();
        } catch (e) {}
        reject(new Error('timeout'));
      }, 8000);

      ws = new WebSocket(OBUNTO_CONFIG.wsUrl);

      ws.onopen = () => {
        ready = true;
        reconnectAttempts = 0;
        clearTimeout(timeoutId);
        emit('connected', {});
        queue.splice(0).forEach(p => ws.send(JSON.stringify(p)));
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      ws.onmessage = evt => {
        let msg;
        try {
          msg = JSON.parse(evt.data);
        } catch (e) {
          return;
        }
        emit(msg.type, msg);
      };

      ws.onerror = () => {
        clearTimeout(timeoutId);
        if (!settled) {
          settled = true;
          connecting = null;
          reject(new Error('connection_error'));
        }
      };

      ws.onclose = () => {
        ready = false;
        connecting = null;
        clearTimeout(timeoutId);
        emit('disconnected', {});
        if (!settled) {
          settled = true;
          reject(new Error('closed'));
        }
        scheduleReconnect();
      };
    });
    return connecting;
  }

  function disconnect() {
    manualClose = true;
    clearTimeout(reconnectTimer);
    if (ws) ws.close();
  }

  function send(payload) {
    if (ready) ws.send(JSON.stringify(payload));
    else queue.push(payload);
  }

  function join(roomId, token) {
    send({ type: 'join', roomId, token });
  }

  function leave(roomId) {
    send({ type: 'leave', roomId });
  }

  function signal(roomId, target, data) {
    send({ type: 'signal', roomId, target, data });
  }

  function chat(roomId, text) {
    send({ type: 'chat', roomId, text });
  }

  function typing(roomId) {
    send({ type: 'typing', roomId });
  }

  function isReady() {
    return ready;
  }

  return { connect, disconnect, join, leave, signal, chat, typing, on, isReady };
})();
