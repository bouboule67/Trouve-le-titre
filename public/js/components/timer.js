import { h } from '../dom.js';
import { store } from '../store.js';

/** Barre de temps calée sur l'horloge du serveur. */
export function timerBar(endsAt, totalMs, { compact = false } = {}) {
  const fill = h('i');
  const label = h('span', { class: 'timer-label' });
  const el = h('div', { class: `timer ${compact ? 'compact' : ''}` }, h('div', { class: 'timer-track' }, fill), label);
  let raf;
  let end = endsAt;
  let total = totalMs;

  const tick = () => {
    const left = Math.max(0, end - store.now());
    const ratio = total > 0 ? Math.min(1, left / total) : 0;
    fill.style.transform = `scaleX(${ratio})`;
    label.textContent = Math.ceil(left / 1000) + 's';
    el.classList.toggle('urgent', left <= 5000 && left > 0);
    if (left > 0) raf = requestAnimationFrame(tick);
  };
  tick();

  return {
    el,
    set(newEnd, newTotal) {
      end = newEnd;
      total = newTotal ?? total;
      cancelAnimationFrame(raf);
      tick();
    },
    destroy: () => cancelAnimationFrame(raf),
  };
}

/** Compte à rebours en gros chiffres, pour les intros. */
export function countdown(endsAt) {
  const el = h('div', { class: 'countdown' });
  let raf;
  let last = -1;
  const tick = () => {
    const n = Math.max(0, Math.ceil((endsAt - store.now()) / 1000));
    if (n !== last) {
      last = n;
      el.textContent = n || 'GO';
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
    if (endsAt > store.now()) raf = requestAnimationFrame(tick);
  };
  tick();
  return { el, destroy: () => cancelAnimationFrame(raf) };
}
