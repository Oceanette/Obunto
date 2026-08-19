const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

const PORT = process.env.PORT || 3000;

const COLOR_PALETTE = ['#FF3B1F', '#111111', '#5B5B5B', '#1F6F5C', '#2E4C8C', '#8B4FA0'];
const USERNAME_RE = /^[a-zA-Z0-9_\-]{3,20}$/;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

/* ------------------------------------------------------------------ */
/* Persistência                                                        */
/* ------------------------------------------------------------------ */

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

let users = loadJson(USERS_FILE, []);
let messagesStore = loadJson(MESSAGES_FILE, {});

let usersSaveQueued = false;
function saveUsers() {
  if (usersSaveQueued) return;
  usersSaveQueued = true;
  setImmediate(() => {
    usersSaveQueued = false;
    fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), () => {});
  });
}

let messagesSaveQueued = false;
function saveMessages() {
  if (messagesSaveQueued) return;
  messagesSaveQueued = true;
  setImmediate(() => {
    messagesSaveQueued = false;
    fs.writeFile(MESSAGES_FILE, JSON.stringify(messagesStore, null, 2), () => {});
  });
}

/* ------------------------------------------------------------------ */
/* Usuários / senhas                                                   */
/* ------------------------------------------------------------------ */

function findUserByUsernameLower(usernameLower) {
  return users.find(u => u.usernameLower === usernameLower) || null;
}

function findUserById(id) {
  return users.find(u => u.id === id) || null;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, hash) {
  const candidate = hashPassword(password, salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function publicProfile(user) {
  return {
    id: user.id,
    username: user.username,
    color: user.color,
    displayName: user.displayName || null,
    bio: user.bio || '',
    avatar: user.avatar || null,
    createdAt: user.createdAt
  };
}

/* ------------------------------------------------------------------ */
/* Sessões (em memória — cai ao reiniciar, contas continuam salvas)    */
/* ------------------------------------------------------------------ */

const sessions = new Map(); // token -> userId

function tokenFromReq(req) {
  const header = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

function requireAuth(req) {
  const token = tokenFromReq(req);
  if (!token) return null;
  const userId = sessions.get(token);
  if (!userId) return null;
  const user = findUserById(userId);
  if (!user) return null;
  return { token, user };
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ */
/* Arquivos estáticos                                                  */
/* ------------------------------------------------------------------ */

function serveStatic(req, res, pathname) {
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(reqPath)));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ */
/* API                                                                  */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, parsed) {
  const pathname = parsed.pathname;
  const method = req.method;

  try {
    if (pathname === '/api/colors' && method === 'GET') {
      return sendJson(res, 200, { colors: COLOR_PALETTE });
    }

    if (pathname === '/api/check-username' && method === 'GET') {
      const raw = (parsed.query.u || '').toString().trim();
      if (!USERNAME_RE.test(raw)) {
        return sendJson(res, 200, { available: false });
      }
      const exists = !!findUserByUsernameLower(raw.toLowerCase());
      return sendJson(res, 200, { available: !exists });
    }

    if (pathname === '/api/register' && method === 'POST') {
      const body = await readBody(req);
      const username = (body.username || '').toString().trim();
      const password = (body.password || '').toString();
      let color = (body.color || '').toString();

      if (!USERNAME_RE.test(username)) {
        return sendJson(res, 400, { error: 'nome_invalido' });
      }
      if (password.length < 6) {
        return sendJson(res, 400, { error: 'senha_invalida' });
      }
      const usernameLower = username.toLowerCase();
      if (findUserByUsernameLower(usernameLower)) {
        return sendJson(res, 409, { error: 'nome_em_uso' });
      }
      if (!COLOR_PALETTE.includes(color)) {
        color = COLOR_PALETTE[0];
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(password, salt);
      const user = {
        id: 'u-' + crypto.randomBytes(8).toString('hex'),
        username,
        usernameLower,
        salt,
        hash,
        color,
        displayName: null,
        bio: '',
        avatar: null,
        createdAt: Date.now()
      };
      users.push(user);
      saveUsers();

      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, user.id);

      return sendJson(res, 200, { token, user: publicProfile(user) });
    }

    if (pathname === '/api/login' && method === 'POST') {
      const body = await readBody(req);
      const username = (body.username || '').toString().trim().toLowerCase();
      const password = (body.password || '').toString();

      const user = findUserByUsernameLower(username);
      if (!user || !verifyPassword(password, user.salt, user.hash)) {
        return sendJson(res, 401, { error: 'credenciais_invalidas' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, user.id);
      return sendJson(res, 200, { token, user: publicProfile(user) });
    }

    if (pathname === '/api/logout' && method === 'POST') {
      const token = tokenFromReq(req);
      if (token) sessions.delete(token);
      return sendJson(res, 200, {});
    }

    if (pathname === '/api/me' && method === 'GET') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'nao_autenticado' });
      return sendJson(res, 200, { user: publicProfile(auth.user) });
    }

    if (pathname === '/api/profile' && method === 'POST') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'nao_autenticado' });
      const body = await readBody(req);
      const displayName = (body.displayName || '').toString().trim().slice(0, 32);
      const bio = (body.bio || '').toString().slice(0, 900);

      auth.user.displayName = displayName || null;
      auth.user.bio = bio;
      saveUsers();
      broadcastProfileUpdate(auth.user.id);

      return sendJson(res, 200, { user: publicProfile(auth.user) });
    }

    if (pathname === '/api/avatar' && method === 'POST') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'nao_autenticado' });
      const body = await readBody(req);
      const image = (body.image || '').toString();
      if (!image.startsWith('data:image/')) {
        return sendJson(res, 400, { error: 'requisicao_invalida' });
      }
      auth.user.avatar = image;
      saveUsers();
      broadcastProfileUpdate(auth.user.id);
      return sendJson(res, 200, { avatar: auth.user.avatar });
    }

    if (pathname === '/api/avatar/remove' && method === 'POST') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'nao_autenticado' });
      auth.user.avatar = null;
      saveUsers();
      broadcastProfileUpdate(auth.user.id);
      return sendJson(res, 200, {});
    }

    return sendJson(res, 404, { error: 'nao_encontrado' });
  } catch (e) {
    return sendJson(res, 400, { error: 'requisicao_invalida' });
  }
}

/* ------------------------------------------------------------------ */
/* Servidor HTTP                                                       */
/* ------------------------------------------------------------------ */

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname.startsWith('/api/')) {
    handleApi(req, res, parsed);
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, parsed.pathname);
  } else {
    res.writeHead(404);
    res.end();
  }
});

/* ------------------------------------------------------------------ */
/* WebSocket signaling                                                 */
/* ------------------------------------------------------------------ */

const wss = new WebSocketServer({ server });

const rooms = new Map();          // roomId -> Map(userId -> { ws, profile })
const userRooms = new Map();      // userId -> Set(roomId)
const userConnections = new Map(); // userId -> ws (conexão "ativa" atual)

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcastToRoom(roomId, payload, excludeUserId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.forEach((info, uid) => {
    if (uid === excludeUserId) return;
    send(info.ws, payload);
  });
}

function removeFromRoom(userId, roomId) {
  const room = rooms.get(roomId);
  if (room && room.has(userId)) {
    room.delete(userId);
    if (room.size === 0) rooms.delete(roomId);
    broadcastToRoom(roomId, { type: 'peer-left', roomId, userId });
  }
  const set = userRooms.get(userId);
  if (set) {
    set.delete(roomId);
    if (set.size === 0) userRooms.delete(userId);
  }
}

function broadcastProfileUpdate(userId) {
  const user = findUserById(userId);
  if (!user) return;
  const profile = publicProfile(user);
  const set = userRooms.get(userId);
  if (!set) return;
  set.forEach(roomId => {
    const room = rooms.get(roomId);
    if (room && room.has(userId)) room.get(userId).profile = profile;
    broadcastToRoom(roomId, { type: 'profile-updated', roomId, userId, profile });
  });
}

function handleJoin(ws, roomId, token) {
  if (!roomId || !token) return;
  const userId = sessions.get(token);
  const user = userId ? findUserById(userId) : null;
  if (!user) {
    send(ws, { type: 'auth-error' });
    return;
  }

  ws.userId = user.id;

  // Substitui conexão "fantasma" anterior do mesmo usuário
  const existing = userConnections.get(user.id);
  if (existing && existing !== ws) {
    try {
      existing.close();
    } catch (e) {}
  }
  userConnections.set(user.id, ws);

  if (!ws.rooms) ws.rooms = new Set();
  ws.rooms.add(roomId);

  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  const room = rooms.get(roomId);

  const profile = publicProfile(user);

  const peers = [];
  room.forEach((info, uid) => {
    if (uid !== user.id) peers.push({ userId: uid, profile: info.profile });
  });

  room.set(user.id, { ws, profile });

  if (!userRooms.has(user.id)) userRooms.set(user.id, new Set());
  userRooms.get(user.id).add(roomId);

  const payload = { type: 'joined', roomId, peers, profile };
  if (roomId.startsWith('text:')) {
    payload.history = (messagesStore[roomId] || []).slice(-200);
  }
  send(ws, payload);

  broadcastToRoom(roomId, { type: 'peer-joined', roomId, userId: user.id, profile }, user.id);
}

function handleLeave(ws, roomId) {
  if (!ws.userId || !roomId) return;
  removeFromRoom(ws.userId, roomId);
  if (ws.rooms) ws.rooms.delete(roomId);
}

function handleSignal(ws, roomId, target, data) {
  if (!ws.userId || !roomId || !target) return;
  const room = rooms.get(roomId);
  if (!room) return;
  const targetInfo = room.get(target);
  if (targetInfo) {
    send(targetInfo.ws, { type: 'signal', roomId, from: ws.userId, data });
  }
}

function handleChat(ws, roomId, text) {
  if (!ws.userId || !roomId || typeof text !== 'string') return;
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return;
  const user = findUserById(ws.userId);
  if (!user) return;

  const msgObj = {
    type: 'chat',
    roomId,
    userId: ws.userId,
    profile: publicProfile(user),
    text: trimmed,
    ts: Date.now()
  };

  if (!messagesStore[roomId]) messagesStore[roomId] = [];
  messagesStore[roomId].push(msgObj);
  if (messagesStore[roomId].length > 500) {
    messagesStore[roomId] = messagesStore[roomId].slice(-500);
  }
  saveMessages();

  broadcastToRoom(roomId, msgObj);
}

function handleTyping(ws, roomId) {
  if (!ws.userId || !roomId) return;
  const user = findUserById(ws.userId);
  if (!user) return;
  broadcastToRoom(roomId, { type: 'typing', roomId, profile: publicProfile(user) }, ws.userId);
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }
    switch (msg.type) {
      case 'join':
        handleJoin(ws, msg.roomId, msg.token);
        break;
      case 'leave':
        handleLeave(ws, msg.roomId);
        break;
      case 'signal':
        handleSignal(ws, msg.roomId, msg.target, msg.data);
        break;
      case 'chat':
        handleChat(ws, msg.roomId, msg.text);
        break;
      case 'typing':
        handleTyping(ws, msg.roomId);
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    const userId = ws.userId;
    if (!userId) return;
    if (userConnections.get(userId) === ws) {
      userConnections.delete(userId);
    }
    if (ws.rooms) {
      Array.from(ws.rooms).forEach(roomId => removeFromRoom(userId, roomId));
    }
  });
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeatInterval));

/* ------------------------------------------------------------------ */

server.listen(PORT, () => {
  console.log('OBUNTO rodando na porta ' + PORT);
});