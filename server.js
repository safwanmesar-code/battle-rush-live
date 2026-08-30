/**
 * BATTLE RUSH LIVE - Server
 * ---------------------------------------------------------
 * - Serves the static frontend (game view + control panel)
 * - Relays real-time events over WebSocket:
 *      CONTROL PHONE  --->  SERVER  --->  GAME BROWSER
 * - Holds the CONTROL_TOKEN secret (never sent to the browser
 *   in cleartext JS - it is only checked here on the server).
 * - Provides a pluggable TikTokEventProvider interface so a
 *   real TikTok LIVE connector can be dropped in later without
 *   touching the game code.
 *
 * Run:   npm install && npm start
 * Env:   PORT (default 3000), CONTROL_TOKEN (default "changeme123")
 * ---------------------------------------------------------
 */

const path = require('path');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const CONTROL_TOKEN = process.env.CONTROL_TOKEN || 'changeme123';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Friendly routes
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('/control', (req, res) => res.sendFile(path.join(__dirname, 'public', 'control.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** All connected sockets, tagged by role */
const gameClients = new Set();
const controlClients = new Set();

function broadcastToGame(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of gameClients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const role = url.searchParams.get('role');
  const token = url.searchParams.get('token');

  if (role === 'control') {
    if (token !== CONTROL_TOKEN) {
      ws.send(JSON.stringify({ type: 'AUTH_FAILED' }));
      ws.close();
      return;
    }
    controlClients.add(ws);
    ws.send(JSON.stringify({ type: 'AUTH_OK' }));

    ws.on('message', (raw) => {
      let data;
      try { data = JSON.parse(raw); } catch { return; }
      // Whatever the control panel sends, forward straight to the game(s).
      // Every action from the phone becomes a game event.
      if (data && data.type === 'action') {
        broadcastToGame({ type: 'EVENT', source: 'CONTROL', action: data.action, payload: data.payload || {} });
      }
      if (data && data.type === 'DEMO_MODE') {
        setDemoMode(!!data.enabled);
      }
    });

    ws.on('close', () => controlClients.delete(ws));
  } else {
    // default: game view
    gameClients.add(ws);
    ws.on('close', () => gameClients.delete(ws));
  }
});

// ---------------------------------------------------------------
// TikTok event abstraction layer
// ---------------------------------------------------------------
// Any provider just has to call `onEvent(normalizedEvent)`.
// normalizedEvent shape:
//   { type: 'LIKE'|'FOLLOW'|'SHARE'|'COMMENT'|'GIFT'|'JOIN',
//     senderName, comment, giftName, giftValue }

class TikTokEventProvider {
  constructor(onEvent) { this.onEvent = onEvent; }
  start() { /* connect to real TikTok LIVE here later */ }
  stop() {}
}

/** Fake viewers/likes/gifts/comments for testing without a live stream. */
class MockTikTokProvider extends TikTokEventProvider {
  constructor(onEvent) {
    super(onEvent);
    this.timer = null;
    this.names = ['ahmed_92', 'sara.live', 'mo_gamer', 'liiive_fan', 'nour_tv', 'khaled99'];
    this.comments = ['RED', 'BLUE', 'ATTACK', 'HEAL', 'BOSS', 'METEOR', 'SHIELD', 'go go go', '🔥🔥🔥'];
    this.gifts = [
      { giftName: 'Rose', giftValue: 1 },
      { giftName: 'Heart', giftValue: 5 },
      { giftName: 'Crown', giftValue: 100 },
      { giftName: 'Lion', giftValue: 1000 },
    ];
  }
  randomName() { return this.names[Math.floor(Math.random() * this.names.length)]; }

  fireRandomEvent() {
    const roll = Math.random();
    let evt;
    if (roll < 0.30) evt = { type: 'LIKE', senderName: this.randomName() };
    else if (roll < 0.45) evt = { type: 'FOLLOW', senderName: this.randomName() };
    else if (roll < 0.55) evt = { type: 'SHARE', senderName: this.randomName() };
    else if (roll < 0.60) evt = { type: 'JOIN', senderName: this.randomName() };
    else if (roll < 0.85) {
      evt = { type: 'COMMENT', senderName: this.randomName(), comment: this.comments[Math.floor(Math.random() * this.comments.length)] };
    } else {
      const g = this.gifts[Math.floor(Math.random() * this.gifts.length)];
      evt = { type: 'GIFT', senderName: this.randomName(), giftName: g.giftName, giftValue: g.giftValue };
    }
    this.onEvent(evt);
  }

  start() {
    this.stop();
    this.timer = setInterval(() => this.fireRandomEvent(), 1400);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

// ---------------------------------------------------------------
// Event -> Game action mapping (matches the spec's rules)
// ---------------------------------------------------------------
function commandFromComment(comment) {
  if (!comment) return null;
  const c = comment.trim().toUpperCase();
  const map = {
    RED: 'SUPPORT_RED',
    BLUE: 'SUPPORT_BLUE',
    ATTACK: 'MEGA_ATTACK',
    HEAL: 'HEAL',
    BOSS: 'SPAWN_BOSS',
    METEOR: 'METEOR',
    SHIELD: 'SHIELD',
  };
  for (const key of Object.keys(map)) {
    if (c.includes(key)) return map[key];
  }
  return null;
}

function giftTier(value) {
  if (value >= 1000) return 'MEGA';
  if (value >= 100) return 'LARGE';
  if (value >= 10) return 'MEDIUM';
  return 'SMALL';
}

function handleTikTokEvent(evt) {
  switch (evt.type) {
    case 'LIKE':
      broadcastToGame({ type: 'EVENT', source: 'TIKTOK', action: 'ADD_ENERGY', payload: { amount: 2, from: evt.senderName } });
      break;
    case 'FOLLOW':
      broadcastToGame({ type: 'EVENT', source: 'TIKTOK', action: 'SPAWN_SOLDIER', payload: { from: evt.senderName } });
      break;
    case 'SHARE':
      broadcastToGame({ type: 'EVENT', source: 'TIKTOK', action: 'MEGA_ATTACK', payload: { from: evt.senderName } });
      break;
    case 'JOIN':
      broadcastToGame({ type: 'EVENT', source: 'TIKTOK', action: 'VIEWER_JOINED', payload: { from: evt.senderName } });
      break;
    case 'COMMENT': {
      const action = commandFromComment(evt.comment);
      broadcastToGame({ type: 'EVENT', source: 'TIKTOK', action: 'COMMENT', payload: { from: evt.senderName, text: evt.comment } });
      if (action) broadcastToGame({ type: 'EVENT', source: 'TIKTOK', action, payload: { from: evt.senderName } });
      break;
    }
    case 'GIFT': {
      const tier = giftTier(evt.giftValue);
      broadcastToGame({
        type: 'EVENT', source: 'TIKTOK', action: 'GIFT',
        payload: { from: evt.senderName, giftName: evt.giftName, giftValue: evt.giftValue, tier },
      });
      break;
    }
  }
}

let currentProvider = null;
function setDemoMode(enabled) {
  if (enabled) {
    if (currentProvider) currentProvider.stop();
    currentProvider = new MockTikTokProvider(handleTikTokEvent);
    currentProvider.start();
    broadcastToGame({ type: 'EVENT', source: 'SYSTEM', action: 'DEMO_MODE_ON' });
  } else {
    if (currentProvider) currentProvider.stop();
    currentProvider = null;
    broadcastToGame({ type: 'EVENT', source: 'SYSTEM', action: 'DEMO_MODE_OFF' });
  }
}

// Optional HTTP endpoint so a real TikTok bridge (running elsewhere) can
// push events in without needing a raw WebSocket client.
app.post('/api/tiktok-event', (req, res) => {
  if (req.query.token !== CONTROL_TOKEN) return res.status(401).json({ error: 'bad token' });
  handleTikTokEvent(req.body);
  res.json({ ok: true });
});

server.listen(PORT, () => {
  console.log(`BATTLE RUSH LIVE server running on port ${PORT}`);
  console.log(`Game:    /game`);
  console.log(`Control: /control  (needs ?token=${CONTROL_TOKEN})`);
});
