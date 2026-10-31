// Faux joueur pour tester l'interface seul : `node tests/join-bot.mjs CODE [Nom]`
import WebSocket from 'ws';

const [code, name = 'Robot'] = process.argv.slice(2);
const ws = new WebSocket(process.env.URL || 'ws://localhost:3000');
const send = (m) => ws.send(JSON.stringify(m));
const act = (a, d = {}) => send({ t: 'g', a, ...d });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

ws.on('open', () => send({ t: 'join', code, name, avatar: '🤖' }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.t === 'error') return console.log(m.msg);
  if (m.t !== 'state') return;
  const s = m.s;
  const g = s.game;
  if (s.phase === 'lobby' && s.settings.mode === 'chain' && !s.myVideo) send({ t: 'setMyVideo', url: 'https://youtu.be/OPf0YbXqDm0' });
  if (!g) return;
  const wait = (ms, fn) => setTimeout(fn, ms);
  if (g.mode === 'classic') {
    if (g.phase === 'play' && !g.my?.done) wait(3000, () => act('answer', { text: `Réponse du robot ${g.round + 1}`, done: true }));
    if (g.phase === 'review' && g.author && g.author !== s.me && !g.myVote) wait(1500, () => act('vote', { n: 4 }));
  } else if (g.mode === 'creator') {
    if (g.phase === 'play' && !g.my?.correct && !ws.tried?.has(g.round)) {
      (ws.tried ??= new Set()).add(g.round);
      wait(4000, () => act('guess', { text: 'pas la bonne chaîne' }));
    }
  } else if (g.mode === 'chain' && g.phase === 'play' && !g.done) {
    wait(4000, () => (g.kind === 'title' ? act('submit', { text: `Le robot pense à ${g.round}` }) : act('submit', { img: PNG })));
  }
});
console.log(`Robot « ${name} » rejoint ${code}…`);
