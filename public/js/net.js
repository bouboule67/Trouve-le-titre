import { toast } from './dom.js';
import { store } from './store.js';

const SESSION_KEY = 'tlt.session';
let ws = null;
let retry = 0;

const readSession = () => {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
};
const writeSession = (value) => {
  try {
    value ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)) : sessionStorage.removeItem(SESSION_KEY);
  } catch { /* stockage indisponible */ }
};

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.addEventListener('open', () => {
    retry = 0;
    store.setStatus('online');
    const session = readSession();
    if (session) send({ t: 'resume', ...session });
  });

  ws.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    switch (m.t) {
      case 'joined':
        writeSession({ code: m.code, token: m.token });
        break;
      case 'state':
        store.set(m.s);
        break;
      case 'toast':
        toast(m.msg, m.kind);
        break;
      case 'error':
        toast(m.msg, 'error');
        break;
      case 'gone':
        leaveLocally();
        break;
      case 'kicked':
        leaveLocally();
        toast('Tu as été exclu du lobby.', 'error');
        break;
    }
  });

  ws.addEventListener('close', () => {
    store.setStatus('offline');
    setTimeout(connect, Math.min(4000, 500 * ++retry));
  });
}

export function send(msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
  else toast('Connexion perdue, reconnexion…', 'error');
}

/** Action de jeu, routée par le serveur vers le mode en cours. */
export const act = (a, data = {}) => send({ t: 'g', a, ...data });

export function leaveLocally() {
  writeSession(null);
  store.set(null);
}

export function leave() {
  send({ t: 'leave' });
  leaveLocally();
}
