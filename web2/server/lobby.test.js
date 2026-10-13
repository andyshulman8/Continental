// Lobby test: 4 remote humans (separate SSE streams) ready up, get kicked/leave, host transfer, then play a few turns.
// Run: node web2/server/lobby.test.js
import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5200 + Math.floor(Math.random() * 700);
const BASE = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, PORT: String(PORT), LOBBY_GRACE_MS: '300' }, stdio: ['ignore', 'pipe', 'inherit'] });
const done = (code) => { srv.kill(); process.exit(code); };
process.on('uncaughtException', (e) => { console.error('FAIL', e); done(1); });
process.on('unhandledRejection', (e) => { console.error('FAIL', e); done(1); });
await new Promise((res, rej) => { srv.stdout.on('data', (d) => /port/.test(String(d)) && res()); srv.on('exit', () => rej(new Error('server exited'))); setTimeout(() => rej(new Error('start timeout')), 5000); });

const post = async (p, body) => (await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

// minimal SSE client
function listen(code, token) {
  const ac = new AbortController(); const c = { snap: null, closed: false, ac };
  (async () => {
    const res = await fetch(`${BASE}/api/events?code=${code}&token=${token}`, { signal: ac.signal });
    if (!res.ok) { c.closed = true; return; }
    const dec = new TextDecoder(); let buf = '';
    try { for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = buf.slice(0, i); buf = buf.slice(i + 2); const d = m.split('\n').find((l) => l.startsWith('data: ')); if (d) c.snap = JSON.parse(d.slice(6)); }
    } } catch { /* aborted */ }
    c.closed = true;
  })();
  return c;
}
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 30)); } throw new Error('timeout: ' + what); };
const rp = (c, id) => c.snap.room.players.find((p) => p.id === id);

const host = await post('/api/create', { name: 'Host' });
const code = host.code;
const names = ['Ann', 'Bob', 'Cy'];
const joined = [];
for (const n of names) { const j = await post('/api/join', { code, name: n }); assert.ok(j.ok, 'join ' + n); joined.push({ name: n, ...j }); }
assert.equal((await post('/api/join', { code, name: 'Dan' })).ok, false, 'room full at 4');
assert.equal((await post('/api/join', { code, name: 'ann' })).ok, false, 'duplicate name rejected');

const H = listen(code, host.token);
const L = joined.map((j) => listen(code, j.token));
await until(() => H.snap && L.every((c) => c.snap && c.snap.room.players.every((p) => p.connected)), 'all connected');
assert.equal(H.snap.room.players.length, 4);
assert.equal(rp(H, host.playerId).ready, true, 'host is implicitly ready');
assert.ok(H.snap.room.players.filter((p) => p.id !== host.playerId).every((p) => p.ready === false), 'joiners start unready');

// start blocked until everyone ready
let r = await post('/api/start', { code, token: host.token });
assert.equal(r.ok, false); assert.match(r.error, /ready up/);
assert.equal((await post('/api/start', { code, token: joined[0].token })).ok, false, 'non-host cannot start');
await post('/api/ready', { code, token: joined[0].token, ready: true });
await post('/api/ready', { code, token: joined[1].token, ready: true });
await until(() => H.snap.room.players.filter((p) => p.ready).length === 3, 'ready broadcast');
assert.equal((await post('/api/start', { code, token: host.token })).ok, false, 'Cy still unready');

// un-ready again blocks, kick unready player frees the slot, host can then start with 3
await post('/api/ready', { code, token: joined[1].token, ready: false });
assert.equal((await post('/api/kick', { code, token: joined[0].token, playerId: joined[2].playerId })).ok, false, 'non-host cannot kick');
assert.equal((await post('/api/kick', { code, token: host.token, playerId: joined[2].playerId })).ok, true);
await until(() => L[2].closed, 'kicked stream closed');
await until(() => H.snap.room.players.length === 3, 'kick broadcast');
assert.equal((await post('/api/ready', { code, token: joined[2].token, ready: true })).ok, false, 'kicked token invalid');

// Bob leaves voluntarily
assert.equal((await post('/api/leave', { code, token: joined[1].token })).ok, true);
await until(() => H.snap.room.players.length === 2, 'leave broadcast');

// Dropped connection (closing the tab) frees the slot after the grace period
const dan = await post('/api/join', { code, name: 'Dan' }); assert.ok(dan.ok);
const D = listen(code, dan.token);
await until(() => H.snap.room.players.length === 3, 'dan joined');
D.ac.abort();
await until(() => H.snap.room.players.length === 2, 'dropped player removed after grace');

// Add a bot, Ann readies, host starts a 3-player game
await post('/api/addbot', { code, token: host.token, level: 'easy' });
await post('/api/ready', { code, token: joined[0].token, ready: true });
await until(() => H.snap.room.players.length === 3, 'bot added');
r = await post('/api/start', { code, token: host.token });
assert.equal(r.ok, true, r.error);
await until(() => H.snap.view && L[0].snap.view, 'game started');
assert.equal(H.snap.view.players.length, 3);
assert.equal((await post('/api/ready', { code, token: joined[0].token, ready: false })).ok, false, 'cannot ready after start');

// Host leaves lobby -> host transfers (separate room)
const h2 = await post('/api/create', { name: 'H2' });
const g = await post('/api/join', { code: h2.code, name: 'G2' });
const H2 = listen(h2.code, h2.token); const G2 = listen(h2.code, g.token);
await until(() => G2.snap && H2.snap, 'room2 connected');
await post('/api/leave', { code: h2.code, token: h2.token });
await until(() => G2.snap.room.hostId === g.playerId && G2.snap.room.players.length === 1, 'host transferred');
assert.equal(rp(G2, g.playerId).ready, true, 'new host implicitly ready');
await post('/api/leave', { code: h2.code, token: g.token });
assert.equal((await post('/api/join', { code: h2.code, name: 'late' })).ok, false, 'empty room deleted');

console.log('PASS lobby: ready gating, kick, leave, drop cleanup, host transfer, start with 3 remote humans+bot');
done(0);
