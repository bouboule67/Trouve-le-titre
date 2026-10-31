import { confetti, h } from '../dom.js';
import { send } from '../net.js';
import { countdown } from '../components/timer.js';
import { store } from '../store.js';

/** Écran de transition entre deux manches. */
export function introScreen({ emoji, kicker, title, text, endsAt, accent = 'var(--yellow)' }) {
  const cd = countdown(endsAt);
  const el = h('div', { class: 'intro', style: { '--accent': accent } },
    h('div', { class: 'intro-emoji' }, emoji),
    h('div', { class: 'kicker' }, kicker),
    h('h1', { class: 'intro-title' }, title),
    text && h('p', { class: 'intro-text' }, text),
    cd.el,
  );
  return { el, update() {}, destroy: cd.destroy };
}

/** Bouton « retour au lobby » (chef) ou message d'attente. */
export function endActions() {
  const host = store.isHost;
  return h('div', { class: 'end-actions' },
    host
      ? h('button', { class: 'btn btn-primary btn-lg', onClick: () => send({ t: 'backToLobby' }) }, '↺ Retour au lobby')
      : h('div', { class: 'waiting' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i')), 'Le chef peut relancer une partie'),
  );
}

export function celebrate() {
  setTimeout(() => confetti(), 250);
}

export function roundPill(text) {
  return h('span', { class: 'round-pill' }, text);
}
