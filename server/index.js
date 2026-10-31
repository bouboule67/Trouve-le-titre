import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { LobbyManager, MAX_PLAYERS } from './lobby.js';
import { fetchThumbnail } from './youtube.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const lobbies = new LobbyManager();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const drawing = /^\/d\/([A-Z]{4})\/([\w-]+)$/.exec(url.pathname);
  if (drawing) {
    const img = lobbies.get(drawing[1])?.drawings.get(drawing[2]);
    if (!img) return end(res, 404, 'Introuvable');
    res.writeHead(200, { 'content-type': img.type, 'cache-control': 'public, max-age=86400, immutable' });
    return res.end(img.buf);
  }
  const thumb = /^\/thumb\/([\w-]{11})\/(maxresdefault|sddefault|hqdefault)$/.exec(url.pathname);
  if (thumb) {
    fetchThumbnail(thumb[1], thumb[2])
      .then((buf) => {
        if (!buf) return end(res, 404, 'Introuvable');
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' });
        res.end(buf);
      })
      .catch(() => end(res, 502, 'Miniature indisponible'));
    return;
  }
  if (url.pathname === '/health') return end(res, 200, 'ok');

  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return end(res, 403, 'Interdit');
  fs.readFile(file, (err, data) => {
    if (err) return end(res, 404, 'Introuvable');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

function end(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

// ---------- WebSocket ----------

const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 });

wss.on('connection', (ws) => {
  const conn = { lobby: null, player: null };
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    onMessage(ws, conn, msg).catch((err) => console.error('[ws]', err));
  });
  ws.on('close', () => conn.lobby?.detach(conn.player, ws));
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 25_000).unref();

const reply = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

function enter(ws, conn, lobby, player) {
  if (conn.lobby && conn.player !== player) conn.lobby.detach(conn.player, ws);
  conn.lobby = lobby;
  conn.player = player;
  reply(ws, { t: 'joined', code: lobby.code, token: player.token, id: player.id });
  lobby.attach(player, ws);
}

async function onMessage(ws, conn, m) {
  if (m.t === 'create') {
    const lobby = lobbies.create();
    return enter(ws, conn, lobby, lobby.addPlayer(m.name, m.avatar));
  }
  if (m.t === 'join') {
    const lobby = lobbies.get(m.code);
    if (!lobby) return reply(ws, { t: 'error', msg: 'Aucun lobby avec ce code.' });
    if (lobby.game) return reply(ws, { t: 'error', msg: 'La partie a déjà commencé.' });
    if (lobby.players.size >= MAX_PLAYERS) return reply(ws, { t: 'error', msg: 'Le lobby est plein.' });
    return enter(ws, conn, lobby, lobby.addPlayer(m.name, m.avatar));
  }
  if (m.t === 'resume') {
    const lobby = lobbies.get(m.code);
    const player = lobby && [...lobby.players.values()].find((p) => p.token === m.token);
    if (!player) return reply(ws, { t: 'gone' });
    return enter(ws, conn, lobby, player);
  }
  if (m.t === 'leave') {
    conn.lobby?.removePlayer(conn.player.id);
    conn.lobby = conn.player = null;
    return;
  }
  if (conn.lobby) await conn.lobby.handle(conn.player, m);
}

server.listen(PORT, () => {
  console.log(`\n  🎬 Trouve le titre est lancé !\n  → http://localhost:${PORT}\n`);
});
