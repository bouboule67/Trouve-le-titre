// Test de fumée : 3 faux joueurs déroulent les 3 modes de bout en bout.
// Usage : lancer le serveur (npm start) puis `node tests/smoke.mjs`
import WebSocket from 'ws';

const URL = process.env.URL || 'ws://localhost:3000';
const VIDEOS = ['dQw4w9WgXcQ', 'YQHsXMglC9A', '9bZkp7q19f0'];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => {
  if (!cond) throw new Error('ÉCHEC : ' + msg);
  console.log('  ✓', msg);
};

class Bot {
  constructor(name) {
    this.name = name;
    this.state = null;
    this.ws = new WebSocket(URL);
    this.ready = new Promise((r) => this.ws.on('open', r));
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'state') { this.state = m.s; this.onState?.(m.s); }
      if (m.t === 'error' || (m.t === 'toast' && m.kind === 'error')) console.log(`   [${name}] ${m.msg}`);
    });
  }
  send(msg) { this.ws.send(JSON.stringify(msg)); }
  act(a, data = {}) { this.send({ t: 'g', a, ...data }); }
  async until(pred, label, timeout = 30000) {
    const start = Date.now();
    while (!(this.state && pred(this.state))) {
      if (Date.now() - start > timeout) throw new Error(`Timeout : ${label}`);
      await sleep(50);
    }
  }
}

const [a, b, c] = ['Alice', 'Bob', 'Chloé'].map((n) => new Bot(n));
await Promise.all([a, b, c].map((x) => x.ready));
a.send({ t: 'create', name: 'Alice', avatar: '🦊' });
await a.until((s) => s.code, 'création');
const code = a.state.code;
console.log('Lobby', code);
b.send({ t: 'join', code, name: 'Bob', avatar: '🐸' });
c.send({ t: 'join', code, name: 'Chloé', avatar: '🐼' });
await a.until((s) => s.players.length === 3, '3 joueurs');
assert(true, '3 joueurs dans le lobby');

// ---------- Mode 1 : petit bac ----------
console.log('\nMode 1 – Petit bac');
await a.until((s) => s.videoCount >= 1, 'liste par défaut chargée');
assert(a.state.videos === undefined || a.state.videos.length === 0, 'la base de vidéos n’est visible pour personne, pas même le chef');
a.send({ t: 'settings', mode: 'classic', rounds: 2, timeSec: 10 });
a.send({ t: 'start' });
for (const bot of [a, b, c]) {
  bot.onState = (s) => {
    const g = s.game;
    if (!g) return;
    if (g.phase === 'play' && !g.my?.done) bot.act('answer', { text: `Titre de ${bot.name} #${g.round}`, done: true });
    if (g.phase === 'review' && g.author && g.author !== s.me && !g.myVote) bot.act('vote', { n: 1 + (bot.name.length % 5) });
    if (g.phase === 'play') assert_noleak(g);
  };
}
function assert_noleak(g) {
  if (g.video.title) throw new Error('le titre fuit pendant la manche !');
}
await a.until((s) => s.game?.phase === 'review', 'review', 40000);
assert(true, 'la review démarre après les 2 manches');
await a.until((s) => s.game?.phase === 'final', 'final', 40000);
const ranking = a.state.game.final.ranking;
assert(ranking.length === 3, 'classement : ' + ranking.map((r) => `${a.state.players.find((p) => p.id === r.pid).name}=${r.total}`).join(', '));
for (const bot of [a, b, c]) bot.onState = null;
a.send({ t: 'backToLobby' });
await a.until((s) => s.phase === 'lobby', 'retour lobby');

// ---------- Mode 3 : créateur ----------
console.log('\nMode 3 – Qui a sorti ça ?');
const { fetchVideoInfo } = await import('../server/youtube.js');
const { parseVideoId } = await import('../server/youtube.js');
const { readFileSync } = await import('node:fs');
const ids = [...new Set(readFileSync('playlists/default.txt', 'utf8').split(/\s+/).map(parseVideoId).filter(Boolean))];
const authors = new Map();
for (let i = 0; i < ids.length; i += 8) {
  await Promise.all(ids.slice(i, i + 8).map(async (id) => { const v = await fetchVideoInfo(id); authors.set(v.title, v.author); }));
}
a.send({ t: 'settings', mode: 'creator', rounds: 2, timeSec: 10 });
a.send({ t: 'start' });
for (const bot of [a, b, c]) {
  bot.onState = (s) => {
    const g = s.game;
    if (g?.phase === 'play' && !g.my?.correct && !bot.tried?.has(g.round)) {
      (bot.tried ??= new Set()).add(g.round);
      bot.act('guess', { text: 'mauvaise chaîne' });
      setTimeout(() => bot.act('guess', { text: authors.get(g.video.title).toLowerCase() }), 200);
    }
    if (g?.phase === 'reveal' && bot === a) a.act('skip');
  };
}
await a.until((s) => s.game?.phase === 'final', 'final créateur', 40000);
const cr = a.state.game.final.ranking;
assert(cr.every((r) => r.total > 800), 'tout le monde a marqué : ' + cr.map((r) => r.total).join(', '));
for (const bot of [a, b, c]) bot.onState = null;
a.send({ t: 'backToLobby' });
await a.until((s) => s.phase === 'lobby', 'retour lobby');

// ---------- Mode 2 : téléphone arabe ----------
console.log('\nMode 2 – Téléphone arabe');
a.send({ t: 'settings', mode: 'chain', writeSec: 15, drawSec: 30 });
[a, b, c].forEach((bot, i) => bot.send({ t: 'setMyVideo', url: VIDEOS[i] }));
await a.until((s) => s.players.every((p) => p.hasVideo), 'vidéos de chacun');
a.send({ t: 'start' });
await a.until((s) => s.game, 'départ chaîne');
for (const bot of [a, b, c]) {
  bot.onState = (s) => {
    const g = s.game;
    if (g?.phase === 'play' && !g.done) {
      if (g.kind === 'title') bot.act('submit', { text: `${bot.name} pense à une vidéo (étape ${g.round})` });
      else bot.act('submit', { img: PNG });
    }
    if (g?.phase === 'reveal' && bot === a) setTimeout(() => a.act('next'), 30);
  };
}
await a.until((s) => s.game?.phase === 'reveal', 'reveal', 60000);
const chains = a.state.game.chains;
assert(chains.length === 3 && chains.every((ch) => ch.steps.length === 3), 'chaînes de 3 étapes (vidéo, titre, dessin)');
assert(chains.every((ch) => ch.steps[2].img?.startsWith('/d/')), 'dessins enregistrés');
const res = await fetch(`http://localhost:3000${chains[0].steps[2].img}`);
assert(res.ok && res.headers.get('content-type') === 'image/png', 'dessin servi en HTTP');
const owners = new Set(chains.map((ch) => ch.owner));
assert(chains.every((ch) => new Set(ch.steps.map((s) => s.pid)).size === ch.steps.length), 'personne ne traite deux fois la même chaîne');
assert(owners.size === 3, 'une chaîne par joueur');
await a.until((s) => s.game?.phase === 'final', 'final chaîne', 20000);

console.log('\n✅ Tous les modes fonctionnent.');
process.exit(0);
