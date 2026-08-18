const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const MAX_HISTORY_PER_ROOM = 200;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const COLORS = ['#FF2E1B', '#ECECE8', '#5B5B5B', '#1F6F5C', '#2E4C8C', '#8B4FA0'];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return new Map(arr.map(u => [u.usernameLower, u]));
  } catch (e) {
    return new Map();
  }
}

function persistUsers() {
  const arr = Array.from(users.values());
  fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2));
}

function loadMessages() {
  try {
    const raw = fs.readFileSync(MESSAGES_FILE, 'utf8');
    const obj = JSON.parse(raw);
    return new Map(Object.entries(obj));
  } catch (e) {
    return new Map();
  }
}

let persistMessagesTimer = null;
function persistMessages() {
  clearTimeout(persistMessagesTimer);
  persistMessagesTimer = setTimeout(() => {
    const obj = {};
    messages.forEach((list, roomId) => {
      obj[roomId] = list;
    });
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(obj, null, 2));
  }, 250);
}

const users = loadUsers();
const messages = loadMessages();
const sessions = new Map();

function normalizeUsername(name) {
  return String(name || '').trim();
}

function usernameKey(name) {
  return normalizeUsername(name).toLowerCase();
}

function validUsername(name) {
  return /^[a-zA-Z0-9_\-]{3,20}$/.test(name);
}

function validPassword(pw) {
  return typeof pw === 'string' && pw.length >= 6 && pw.length <= 128;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createUser(username, password, color) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const user = {
    id: 'u-' + crypto.randomBytes(8).toString('hex'),
    username: normalizeUsername(username),
    usernameLower: usernameKey(username),
    salt,
    hash,
    color: COLORS.includes(color) ? color : COLORS[Math.floor(Math.random() * COLORS.length)],
    createdAt: Date.now()
  };
  users.set(user.usernameLower, user);
  persistUsers();
  return user;
}

function verifyUser(username, password) {
  const user = users.get(usernameKey(username));
  if (!user) return null;
  const hash = hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  return user;
}

function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}

function sessionUser(token) {
  const session = sessions.get(token);
  if (!session) return null;
  const user = Array.from(users.values()).find(u => u.id === session.userId);
  return user || null;
}

function publicUser(user) {
  return { id: user.id, username: user.username, color: user.color };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1e6) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function getBearerToken(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer (.+)$/);
  if (match) return match[1];
  const url = new URL(req.url, 'http://internal');
  return url.searchParams.get('token');
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/colors' && req.method === 'GET') {
    return sendJson(res, 200, { colors: COLORS });
  }

  if (pathname === '/api/check-username' && req.method === 'GET') {
    const url = new URL(req.url, 'http://internal');
    const name = normalizeUsername(url.searchParams.get('u'));
    if (!validUsername(name)) {
      return sendJson(res, 200, { available: false, reason: 'formato_invalido' });
    }
    const taken = users.has(usernameKey(name));
    return sendJson(res, 200, { available: !taken });
  }

  if (pathname === '/api/register' && req.method === 'POST') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: 'requisicao_invalida' });
    }
    const username = normalizeUsername(body.username);
    const password = body.password;
    if (!validUsername(username)) {
      return sendJson(res, 400, { error: 'nome_invalido' });
    }
    if (!validPassword(password)) {
      return sendJson(res, 400, { error: 'senha_invalida' });
    }
    if (users.has(usernameKey(username))) {
      return sendJson(res, 409, { error: 'nome_em_uso' });
    }
    const user = createUser(username, password, body.color);
    const token = createSession(user.id);
    return sendJson(res, 201, { token, user: publicUser(user) });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: 'requisicao_invalida' });
    }
    const user = verifyUser(body.username, body.password);
    if (!user) {
      return sendJson(res, 401, { error: 'credenciais_invalidas' });
    }
    const token = createSession(user.id);
    return sendJson(res, 200, { token, user: publicUser(user) });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const token = getBearerToken(req);
    if (token) sessions.delete(token);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    const token = getBearerToken(req);
    const user = token ? sessionUser(token) : null;
    if (!user) return sendJson(res, 401, { error: 'sessao_invalida' });
    return sendJson(res, 200, { user: publicUser(user) });
  }

  sendJson(res, 404, { error: 'nao_encontrado' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://internal');
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch(() => sendJson(res, 500, { error: 'erro_interno' }));
    return;
  }

  let reqPath = pathname;
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, reqPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

function roomIsTextChannel(roomId) {
  return typeof roomId === 'string' && roomId.indexOf('text:') === 0;
}

function pushMessage(roomId, message) {
  if (!messages.has(roomId)) messages.set(roomId, []);
  const list = messages.get(roomId);
  list.push(message);
  if (list.length > MAX_HISTORY_PER_ROOM) list.splice(0, list.length - MAX_HISTORY_PER_ROOM);
  persistMessages();
}

function getHistory(roomId) {
  return messages.get(roomId) || [];
}

function broadcastRoom(roomId, data, exceptWs) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.forEach(client => {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function leaveRoom(ws, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (!room.has(ws)) return;
  room.delete(ws);
  ws.rooms.delete(roomId);
  broadcastRoom(roomId, { type: 'peer-left', roomId, userId: ws.userId }, null);
  if (room.size === 0) rooms.delete(roomId);
}

function safeSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

wss.on('connection', ws => {
  ws.rooms = new Set();
  ws.userId = null;
  ws.profile = null;
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

    if (msg.type === 'join') {
      const user = sessionUser(msg.token);
      if (!user) {
        safeSend(ws, { type: 'auth-error', roomId: msg.roomId });
        return;
      }
      ws.userId = user.id;
      ws.profile = publicUser(user);
      const roomId = msg.roomId;
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      const room = rooms.get(roomId);

      const stale = Array.from(room).find(c => c.userId === ws.userId && c !== ws);
      if (stale) {
        room.delete(stale);
        stale.rooms.delete(roomId);
      }

      const existing = Array.from(room).map(c => ({ userId: c.userId, profile: c.profile }));
      room.add(ws);
      ws.rooms.add(roomId);

      const payload = { type: 'joined', roomId, peers: existing };
      if (roomIsTextChannel(roomId)) payload.history = getHistory(roomId);
      safeSend(ws, payload);

      if (!stale) {
        broadcastRoom(roomId, { type: 'peer-joined', roomId, userId: ws.userId, profile: ws.profile }, ws);
      }
    }

    if (msg.type === 'leave') {
      leaveRoom(ws, msg.roomId);
    }

    if (msg.type === 'signal') {
      const room = rooms.get(msg.roomId);
      if (!room) return;
      room.forEach(client => {
        if (client.userId === msg.target && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'signal', roomId: msg.roomId, from: ws.userId, data: msg.data }));
        }
      });
    }

    if (msg.type === 'chat') {
      if (!ws.userId || !ws.profile) return;
      const text = String(msg.text || '').slice(0, 2000).trim();
      if (!text) return;
      const payload = { type: 'chat', roomId: msg.roomId, userId: ws.userId, profile: ws.profile, text, ts: Date.now() };
      pushMessage(msg.roomId, payload);
      broadcastRoom(msg.roomId, payload, null);
    }

    if (msg.type === 'typing') {
      if (!ws.userId || !ws.profile) return;
      broadcastRoom(msg.roomId, { type: 'typing', roomId: msg.roomId, userId: ws.userId, profile: ws.profile }, ws);
    }
  });

  ws.on('close', () => {
    Array.from(ws.rooms).forEach(roomId => leaveRoom(ws, roomId));
  });
});

const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      Array.from(ws.rooms).forEach(roomId => leaveRoom(ws, roomId));
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log('Obunto rodando em http://localhost:' + PORT);
});
