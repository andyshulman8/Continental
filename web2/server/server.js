// Continental v2 server: zero-dependency Node. Static files + JSON API + SSE.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as engine from '../shared/engine.js';
import * as bots from '../shared/bots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../client');
const SHARED_DIR = path.resolve(__dirname, '../shared');
const PORT = Number(process.env.PORT) || 5190;
const BOT_DELAY = Number(process.env.BOT_DELAY_MS) || 900;
const IDLE_MS = 6 * 60 * 60 * 1000;
const MAX_BODY = 64 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
};

const rooms = new Map();
const LEVELS = new Set(['easy', 'normal', 'hard']);
const BOT_NAMES = ['Abuela Bot', 'Tío Bot', 'Prima Bot', 'Nono Bot', 'Lola Bot', 'Pepe Bot'];

const rid = (n = 6) => crypto.randomBytes(n).toString('hex');
const cleanName = (s, fallback = 'Player') => {
  const t = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  return t || fallback;
};
const level = (l) => (LEVELS.has(l) ? l : 'normal');

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let i = 0; i < 1000; i++) {
    let c = '';
    for (let j = 0; j < 4; j++) c += A[crypto.randomInt(A.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('no codes');
}

class Fail extends Error {}
const fail = (m) => { throw new Fail(m); };

function getRoom(code) {
  const r = rooms.get(String(code ?? '').toUpperCase().trim());
  if (!r) fail('Room not found');
  return r;
}
function getPlayer(room, token) {
  const p = room.players.find((x) => !x.isBot && x.token && x.token === token);
  if (!p) fail('Invalid token');
  return p;
}
function addBot(room, lvl, name) {
  const used = new Set(room.players.map((p) => p.name));
  const nm = cleanName(name, '') || BOT_NAMES.find((n) => !used.has(n)) || `Bot ${room.players.length + 1}`;
  const bot = { id: 'b' + rid(3), name: nm, isBot: true, botLevel: level(lvl), connected: true };
  room.players.push(bot);
  return bot;
}

function createRoom(body) {
  const room = {
    code: newCode(), hostId: null, started: false, hard: !!body.hard, claimPenalty: Number.isInteger(body.claimPenalty) ? Math.max(0, Math.min(5, body.claimPenalty)) : 1, players: [],
    state: null, chat: [], clients: new Set(), botTimer: null, lastActive: Date.now(), pendingEvents: [],
  };
  const host = { id: 'p' + rid(3), name: cleanName(body.name), isBot: false, token: rid(16), connected: false };
  room.players.push(host);
  room.hostId = host.id;
  const bl = Array.isArray(body.bots) ? body.bots.slice(0, 3) : [];
  for (const b of bl) addBot(room, b?.level, b?.name);
  rooms.set(room.code, room);
  return { room, host };
}

function roomInfo(room) {
  return {
    code: room.code, hostId: room.hostId, started: room.started, hard: room.hard, claimPenalty: room.claimPenalty,
    players: room.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, ...(p.isBot ? { botLevel: p.botLevel } : {}), connected: p.isBot ? true : !!p.connected })),
  };
}

function snapshotFor(room, playerId, events) {
  let view = null;
  if (room.state) {
    try { view = engine.viewFor(room.state, playerId); } catch { view = null; }
  }
  return { room: roomInfo(room), view, events: events || [], chat: room.chat };
}

function broadcast(room, events = []) {
  room.lastActive = Date.now();
  for (const c of room.clients) {
    try { c.res.write(`data: ${JSON.stringify(snapshotFor(room, c.playerId, events))}\n\n`); } catch { /* closed */ }
  }
  scheduleBot(room);
}

function scheduleBot(room) {
  if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
  const st = room.state;
  if (!room.started || !st || st.phase !== 'playing') return;
  const rp = room.players.find((p) => p.id === engine.currentActor(st));
  if (!rp || !rp.isBot) return;
  const delay = st.pendingClaim ? Math.min(BOT_DELAY, 500) : BOT_DELAY;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!rooms.has(room.code) || room.state !== st) return;
    runBot(room, rp);
  }, delay);
}

function runBot(room, bot) {
  const st = room.state;
  if (!st || st.phase !== 'playing' || engine.currentActor(st) !== bot.id) return;
  let res;
  try {
    const action = bots.chooseAction(engine.viewFor(st, bot.id), bot.botLevel);
    res = engine.act(st, bot.id, action);
  } catch (e) { res = { ok: false, error: String(e?.message || e) }; }
  if (!res.ok) {
    console.error(`[${room.code}] bot ${bot.name} failed: ${res.error}; trying fallback`);
    res = botFallback(st, bot);
  }
  if (res.ok) {
    room.state = res.state;
    broadcast(room, res.events || []);
  } else {
    console.error(`[${room.code}] bot fallback failed: ${res.error}`);
    // avoid a tight loop; retry later
    room.botTimer = setTimeout(() => { room.botTimer = null; runBot(room, bot); }, 3000);
  }
}

function botFallback(st, bot) {
  const me = st.players.find((p) => p.id === bot.id);
  try {
    if (st.pendingClaim) return engine.act(st, bot.id, { type: 'pass' });
    if (st.step === 'draw') return engine.act(st, bot.id, { type: 'draw', from: 'stock' });
    for (const c of [...me.hand].sort((a, b) => engine.cardPoints(b) - engine.cardPoints(a))) {
      const r = engine.act(st, bot.id, { type: 'discard', cardId: c.id });
      if (r.ok) return r;
    }
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  return { ok: false, error: 'no fallback' };
}

function startGame(room) {
  room.state = engine.newGame({
    players: room.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, botLevel: p.botLevel })),
    hard: room.hard, claimPenalty: room.claimPenalty,
  });
  room.started = true;
}

// ---------- API ----------
const API = {
  create(b) {
    const { room, host } = createRoom(b);
    return { ok: true, code: room.code, playerId: host.id, token: host.token };
  },
  join(b) {
    const room = getRoom(b.code);
    const name = cleanName(b.name);
    const existing = room.players.find((p) => !p.isBot && p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (b.token && b.token === existing.token) return { ok: true, code: room.code, playerId: existing.id, token: existing.token };
      fail('That name is already taken in this room');
    }
    if (room.started) fail('Game already started');
    if (room.players.length >= 4) fail('Room is full');
    const p = { id: 'p' + rid(3), name, isBot: false, token: rid(16), connected: false };
    room.players.push(p);
    broadcast(room);
    return { ok: true, code: room.code, playerId: p.id, token: p.token };
  },
  addbot(b) {
    const room = getRoom(b.code); const me = getPlayer(room, b.token);
    if (me.id !== room.hostId) fail('Only the host can do that');
    if (room.started) fail('Game already started');
    if (room.players.length >= 4) fail('Room is full');
    const bot = addBot(room, b.level, b.name);
    broadcast(room);
    return { ok: true, botId: bot.id };
  },
  removebot(b) {
    const room = getRoom(b.code); const me = getPlayer(room, b.token);
    if (me.id !== room.hostId) fail('Only the host can do that');
    if (room.started) fail('Game already started');
    let idx = -1;
    if (b.botId) idx = room.players.findIndex((p) => p.isBot && p.id === b.botId);
    else for (let i = room.players.length - 1; i >= 0; i--) if (room.players[i].isBot) { idx = i; break; }
    if (idx < 0) fail('No bot to remove');
    room.players.splice(idx, 1);
    broadcast(room);
    return { ok: true };
  },
  start(b) {
    const room = getRoom(b.code); const me = getPlayer(room, b.token);
    if (me.id !== room.hostId) fail('Only the host can start the game');
    if (room.started) fail('Game already started');
    if (room.players.length < 2 || room.players.length > 4) fail('Need 2 to 4 players');
    startGame(room);
    broadcast(room);
    return { ok: true };
  },
  act(b) {
    const room = getRoom(b.code); const me = getPlayer(room, b.token);
    if (!room.started || !room.state) fail('Game not started');
    if (!b.action || typeof b.action !== 'object') fail('Missing action');
    const res = engine.act(room.state, me.id, b.action);
    if (!res.ok) return { ok: false, error: res.error };
    room.state = res.state;
    broadcast(room, res.events || []);
    return { ok: true };
  },
  nexthand(b) {
    const room = getRoom(b.code); getPlayer(room, b.token);
    if (!room.state || room.state.phase !== 'handOver') fail('Hand is not over');
    room.state = engine.nextHand(room.state);
    broadcast(room);
    return { ok: true };
  },
  emote(b) {
    const room = getRoom(b.code); const me = getPlayer(room, b.token);
    const text = String(b.text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    if (!text) fail('Empty message');
    room.chat.push({ id: rid(4), playerId: me.id, name: me.name, text, t: Date.now() });
    if (room.chat.length > 50) room.chat.splice(0, room.chat.length - 50);
    broadcast(room);
    return { ok: true };
  },
  rematch(b) {
    const room = getRoom(b.code); getPlayer(room, b.token);
    if (!room.state || room.state.phase !== 'gameOver') fail('Game is not over');
    startGame(room);
    broadcast(room);
    return { ok: true };
  },
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Fail('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch { reject(new Fail('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

function handleSSE(req, res, url) {
  let room, me;
  try {
    room = getRoom(url.searchParams.get('code'));
    me = getPlayer(room, url.searchParams.get('token'));
  } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const client = { res, playerId: me.id };
  room.clients.add(client);
  me.connected = true;
  res.write(`data: ${JSON.stringify(snapshotFor(room, me.id, []))}\n\n`);
  // tell others this player is connected (skip resending to self twice)
  for (const c of room.clients) if (c !== client) {
    try { c.res.write(`data: ${JSON.stringify(snapshotFor(room, c.playerId, []))}\n\n`); } catch { /* */ }
  }
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* */ } }, 15000);
  req.on('close', () => {
    clearInterval(hb);
    room.clients.delete(client);
    if (![...room.clients].some((c) => c.playerId === me.id)) {
      me.connected = false;
      if (rooms.has(room.code)) broadcast(room);
    }
  });
}

function serveStatic(req, res, pathname) {
  let root, rel;
  if (pathname === '/shared' ) { res.writeHead(301, { Location: '/shared/' }); return res.end(); }
  if (pathname.startsWith('/shared/')) { root = SHARED_DIR; rel = pathname.slice('/shared/'.length); }
  else { root = CLIENT_DIR; rel = pathname.slice(1); }
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (decoded.includes('\0')) { res.writeHead(400); return res.end('Bad request'); }
  let file = path.resolve(root, decoded);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  const tryFile = (f, cb) => fs.stat(f, (err, st) => {
    if (!err && st.isDirectory()) return tryFile(path.join(f, 'index.html'), cb);
    cb(err, st, f);
  });
  tryFile(file, (err, st, f) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
  const p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      const name = p.slice(5);
      if (name === 'events' && req.method === 'GET') return handleSSE(req, res, url);
      if (req.method !== 'POST' || !Object.hasOwn(API, name)) return sendJson(res, 404, { ok: false, error: 'Unknown endpoint' });
      const body = await readBody(req);
      return sendJson(res, 200, API[name](body));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, p);
  } catch (e) {
    if (e instanceof Fail) return sendJson(res, 200, { ok: false, error: e.message });
    console.error(e);
    if (!res.headersSent) sendJson(res, 200, { ok: false, error: 'Server error' });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActive > IDLE_MS && room.clients.size === 0) {
      if (room.botTimer) clearTimeout(room.botTimer);
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();

function lanIPs() {
  const out = [];
  for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Continental server on port ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}/`);
  for (const ip of lanIPs()) console.log(`  Network: http://${ip}:${PORT}/`);
});
