import { copyText, h, replace } from './dom.js';
import { connect, leave } from './net.js';
import { store } from './store.js';
import { createChain } from './screens/chain.js';
import { createClassic } from './screens/classic.js';
import { createCreator } from './screens/creator.js';
import { createHome } from './screens/home.js';
import { createLobby } from './screens/lobby.js';

const GAMES = { classic: createClassic, invent: createClassic, chain: createChain, creator: createCreator };
const screenRoot = document.getElementById('screen');
const topbar = document.getElementById('topbar');
let current = { key: null, instance: null };

/** Une même « clé » = même écran, on le met seulement à jour (les champs de saisie ne sont pas perdus). */
function route(s) {
  if (!s) return { key: 'home', make: () => createHome() };
  if (s.phase === 'lobby') return { key: `lobby:${s.code}`, make: () => createLobby(s) };
  const g = s.game;
  const phase = g.phase === 'collect' ? 'play' : g.phase;
  return {
    key: `${g.mode}:${phase}:${g.round ?? ''}:${g.step ?? ''}`,
    make: () => GAMES[g.mode](s),
  };
}

function render(s) {
  document.body.dataset.scene = !s ? 'home' : s.phase === 'lobby' ? s.settings.mode : s.game.mode;
  renderTopbar(s);
  const { key, make } = route(s);
  if (key === current.key) {
    current.instance.update?.(s);
    return;
  }
  current.instance?.destroy?.();
  const instance = make();
  current = { key, instance };
  const wrap = h('div', { class: 'screen-enter' }, instance.el);
  replace(screenRoot, wrap);
  window.scrollTo({ top: 0 });
}

function renderTopbar(s) {
  topbar.classList.toggle('in-room', !!s);
  if (!s) return replace(topbar, logo());
  const online = s.players.filter((p) => p.connected).length;
  replace(topbar,
    logo(),
    h('div', { class: 'topbar-right' },
      h('button', { class: 'code-pill', title: 'Copier le lien du lobby', onClick: () => copyText(`${location.origin}/?c=${s.code}`) }, h('span', {}, 'CODE'), h('b', {}, s.code)),
      h('span', { class: 'online-pill' }, `👥 ${online}`),
      h('button', {
        class: 'btn btn-sm btn-ghost',
        onClick: () => {
          if (confirm('Quitter le lobby ?')) leave();
        },
      }, 'Quitter'),
    ),
  );
}

function logo() {
  return h('div', { class: 'logo' },
    h('span', { class: 'logo-play' }, h('i')),
    h('span', { class: 'logo-text' }, 'Trouve ', h('b', {}, 'le titre')),
  );
}

store.subscribe(render);
render(null);
connect();
