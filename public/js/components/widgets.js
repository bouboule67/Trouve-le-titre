import { avatar, h } from '../dom.js';
import { store } from '../store.js';

/** Pastille joueur, avec un état « a fini ». */
export function playerChip(player, { done = false, note = '', me = false } = {}) {
  return h('div', { class: `pchip ${done ? 'done' : ''} ${me ? 'me' : ''} ${player.connected === false ? 'away' : ''}` },
    avatar(player, 34),
    h('span', { class: 'pchip-name' }, player.name),
    note && h('span', { class: 'pchip-note' }, note),
    done && h('span', { class: 'pchip-check' }, '✓'),
  );
}

export function playerStrip(ids, doneIds = []) {
  const state = store.state;
  return h('div', { class: 'pstrip' },
    ids.map((id) => {
      const p = store.player(id);
      return p && playerChip(p, { done: doneIds.includes(id), me: id === state.me });
    }),
  );
}

/** Note sur 5 étoiles. */
export function stars({ value = 0, onPick, disabled = false } = {}) {
  const el = h('div', { class: `stars ${disabled ? 'disabled' : ''}` });
  const buttons = [1, 2, 3, 4, 5].map((n) =>
    h('button', {
      type: 'button',
      class: 'star',
      disabled,
      'aria-label': `${n} sur 5`,
      onClick: () => onPick?.(n),
      onMouseenter: () => paint(n),
      onMouseleave: () => paint(current),
    }, '★'),
  );
  let current = value;
  const paint = (v) => buttons.forEach((b, i) => b.classList.toggle('on', i < v));
  el.append(...buttons);
  paint(current);
  el.set = (v) => { current = v; paint(v); };
  return el;
}

/** Classement avec podium pour les 3 premiers. */
export function podium(ranking, { unit = 'pts', format = (r) => r.total } = {}) {
  const top = ranking.slice(0, 3);
  const order = [top[1], top[0], top[2]].map((r, i) => r && { r, place: [2, 1, 3][i] });
  const rest = ranking.slice(3);
  return h('div', { class: 'podium-wrap' },
    h('div', { class: 'podium' },
      order.map((slot) => {
        if (!slot) return h('div', { class: 'podium-slot empty' });
        const p = store.player(slot.r.pid);
        return h('div', { class: `podium-slot place-${slot.place}` },
          slot.place === 1 && h('div', { class: 'crown' }, '👑'),
          avatar(p, slot.place === 1 ? 76 : 60),
          h('div', { class: 'podium-name' }, p?.name ?? '?'),
          h('div', { class: 'podium-score' }, `${format(slot.r)} ${unit}`),
          h('div', { class: 'podium-block' }, slot.place),
        );
      }),
    ),
    rest.length > 0 && h('ol', { class: 'rank-list', start: 4 },
      rest.map((r) => {
        const p = store.player(r.pid);
        return h('li', {}, avatar(p, 32), h('span', { class: 'rank-name' }, p?.name ?? '?'), h('b', {}, `${format(r)} ${unit}`));
      }),
    ),
  );
}

export function emptyState(emoji, text) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-emoji' }, emoji), h('p', {}, text));
}
