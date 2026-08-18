const OBUNTO_CONFIG = {
  wsUrl: (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host,
  apiUrl: location.origin + '/api',
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};
