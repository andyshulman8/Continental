// End-to-end smoke test: 1 scripted human + 2 bots, played to game over via HTTP + SSE.
// Run: node web2/server/smoke.test.js   (spawns its own server on a test port with fast bots)
import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as botsMod from '../shared/bots.js';
import * as engine from '../shared/engine.js';

// Without BOTS set, re-run this file for a 3-player (2 bots) and 4-player (3 bots) room.
if (!process.env.BOTS) {
  for (const n of [2, 3]) {
    const r = spawn(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, BOTS: String(n) }, stdio: 'inherit' });
    const code = await new Promise((res) => r.on('exit', res));
    if (code !== 0) process.exit(code);
  }
  process.exit(0);
}
const NBOTS = Number(process.env.BOTS);

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5200 + Math.floor(Math.random() * 700);
const BASE = `http://127.0.0.1:${PORT}`;
const DEADLINE = Date.now() + 240000;

const srv = spawn(process.execPath, [path.join(dir, 'server.js')], {
  env: { ...process.env, PORT: String(PORT), BOT_DELAY_MS: '15' }, stdio: ['ignore', 'pipe', 'inherit'],
});
const done = (code) => { srv.kill(); process.exit(code); };
process.on('uncaughtException', (e) => { console.error('FAIL', e); done(1); });
process.on('unhandledRejection', (e) => { console.error('FAIL', e); done(1); });
await new Promise((res, rej) => { srv.stdout.on('data', (d) => /port/.test(String(d)) && res()); srv.on('exit', () => rej(new Error('server exited'))); setTimeout(() => rej(new Error('server start timeout')), 5000); });

const post = async (p, body) => (await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

// static + errors
let r = await fetch(`${BASE}/shared/engine.js`);
assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /javascript/);
r = await fetch(`${BASE}/shared/..%2fserver%2fserver.js`); assert.ok([403, 404].includes(r.status), 'traversal blocked');
r = await fetch(`${BASE}/..%2fCONTRACT.md`); assert.ok([403, 404].includes(r.status), 'traversal blocked');
assert.equal((await post('/api/join', { code: 'ZZZZ', name: 'x' })).ok, false);
assert.equal((await post('/api/act', { code: 'ZZZZ', token: 'x', action: {} })).ok, false);

const c = await post('/api/create', { name: 'Human', bots: [{ name: 'B1', level: 'easy' }, { level: 'normal' }, { level: 'hard' }].slice(0, NBOTS), hard: false, claimPenalty: 1 });
assert.match(c.code, /^[A-Z]{4}$/); assert.ok(c.token && c.playerId);
assert.equal((await post('/api/start', { code: c.code, token: 'bad' })).ok, false);

// SSE
let snap = null, waiters = [];
const ac = new AbortController();
(async () => {
  const resp = await fetch(`${BASE}/api/events?code=${c.code}&token=${c.token}`, { signal: ac.signal });
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of resp.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const m = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = m.split('\n').find((l) => l.startsWith('data: '));
      if (line) { snap = JSON.parse(line.slice(6)); const w = waiters; waiters = w.filter((f) => !f(snap)); }
    }
  }
})().catch(() => {});
const waitFor = (pred, ms = 20000) => new Promise((res, rej) => {
  if (snap && pred(snap)) return res(snap);
  const t = setTimeout(() => rej(new Error('timeout waiting for state; last: ' + JSON.stringify(snap?.view && {phase: snap.view.phase, turn: snap.view.turn, step: snap.view.step, hi: snap.view.handIndex}))), ms);
  waiters.push((s) => (pred(s) ? (clearTimeout(t), res(s), true) : false));
});

await waitFor((s) => s.room.players.length === NBOTS + 1);
assert.equal(snap.view, null); assert.equal(snap.room.started, false);
assert.equal(snap.room.hostId, c.playerId);
const j = await post('/api/join', { code: c.code, name: 'Human' });
assert.equal(j.ok, false, 'duplicate name rejected without token');
assert.equal((await post('/api/join', { code: c.code, name: 'Human', token: c.token })).token, c.token, 'reconnect by token');
if (NBOTS < 3) {
  assert.equal((await post('/api/addbot', { code: c.code, token: c.token, level: 'hard' })).ok, true);
  assert.equal((await post('/api/removebot', { code: c.code, token: c.token })).ok, true);
}
if (NBOTS === 3) assert.equal((await post('/api/addbot', { code: c.code, token: c.token })).ok, false, 'room full at 4');
assert.equal((await post('/api/emote', { code: c.code, token: c.token, text: 'hola' })).ok, true);
for (let i = 0; i < 55; i++) await post('/api/emote', { code: c.code, token: c.token, text: 'm' + i });
await waitFor((s) => s.chat.length === 50 && s.chat.at(-1).text === 'm54');
assert.equal((await post('/api/start', { code: c.code, token: c.token })).ok, true);
assert.equal((await post('/api/start', { code: c.code, token: c.token })).ok, false, 'already started');

// play: human uses bots.chooseAction
let claims = 0, hands = 0, humanActs = 0, lastErr = 0;
while (Date.now() < DEADLINE) {
  const s = await waitFor((x) => x.view && (x.view.phase !== 'playing' || engine.currentActor(x.view) === c.playerId), 60000);
  const v = s.view;
  if (v.phase === 'gameOver') break;
  if (v.phase === 'handOver') {
    hands++;
    assert.equal((await post('/api/nexthand', { code: c.code, token: c.token })).ok, true);
    await waitFor((x) => x.view.phase !== 'handOver' || x.view.handIndex !== v.handIndex);
    continue;
  }
  if (v.pendingClaim) claims++;
  const action = botsMod.chooseAction(v, 'normal');
  const res = await post('/api/act', { code: c.code, token: c.token, action });
  assert.equal(res.ok, true, 'human action rejected: ' + res.error + ' ' + JSON.stringify(action));
  humanActs++;
  // let SSE catch up so we don't act twice on a stale snapshot
  const sv = JSON.stringify(v);
  await waitFor((x) => x.view && JSON.stringify(x.view) !== sv);
}
assert.equal(snap.view.phase, 'gameOver', 'game reached gameOver before deadline');
assert.equal((await post('/api/act', { code: c.code, token: c.token, action: { type: 'draw', from: 'stock' } })).ok, false);
assert.equal((await post('/api/rematch', { code: c.code, token: c.token })).ok, true);
await waitFor((x) => x.view && x.view.phase === 'playing' && x.view.handIndex === 0);
console.log(`PASS (${NBOTS + 1} players, claims ${claims}): ${hands} hands, ${humanActs} human actions, game reached gameOver and rematch started`);
ac.abort(); done(0);
