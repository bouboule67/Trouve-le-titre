/** Mini helpers DOM : on construit tout avec textContent, jamais d'innerHTML sur du texte joueur. */

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) k.startsWith('--') ? el.style.setProperty(k, v) : (el.style[k] = v);
    } else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function replace(el, ...kids) {
  return append(clear(el), kids);
}

export const AVATARS = ['😎', '🤠', '🦊', '🐸', '🐼', '🦄', '👽', '🤖', '👻', '🐙', '🦖', '🐯', '🍕', '🔥', '🚀', '🎸', '🧠', '🥷', '🐧', '🦁', '🍄', '👑', '💀', '🌵'];

export function avatar(player, size = 40) {
  return h('span', {
    class: 'avatar',
    style: { '--c': player?.color || '#8b6cff', '--s': size + 'px' },
    title: player?.name,
  }, player?.avatar || '❔');
}

/** Miniature YouTube en 16:9 avec repli sur les tailles plus petites si maxres n'existe pas. */
export function thumb(videoId, { cls = '', blur = false } = {}) {
  const sizes = ['maxresdefault', 'sddefault', 'hqdefault'];
  let i = 0;
  const url = (n) => `https://i.ytimg.com/vi/${videoId}/${sizes[n]}.jpg`;
  const img = h('img', { src: url(0), alt: '', draggable: false, referrerPolicy: 'no-referrer' });
  const next = () => {
    if (i < sizes.length - 1) img.src = url(++i);
  };
  img.addEventListener('error', next);
  img.addEventListener('load', () => {
    if (img.naturalWidth <= 120) next(); // image grise de remplacement
  });
  return h('div', { class: `thumb ${blur ? 'is-blur' : ''} ${cls}` }, img);
}

export function toast(msg, kind = 'info') {
  const box = document.getElementById('toasts');
  const el = h('div', { class: `toast toast-${kind}` }, msg);
  box.append(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}

export function copyText(text) {
  const done = () => toast('Copié !', 'ok');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}

function fallbackCopy(text, done) {
  const t = h('textarea', { value: text, style: { position: 'fixed', opacity: 0 } });
  document.body.append(t);
  t.select();
  try { document.execCommand('copy'); done(); } catch { toast('Copie impossible', 'error'); }
  t.remove();
}

export function confetti(count = 90) {
  const layer = document.getElementById('confetti');
  const colors = ['#ff4d6d', '#ffd23f', '#35e0d0', '#8b6cff', '#b6f34d', '#ff9f43'];
  for (let i = 0; i < count; i++) {
    const bit = h('i', {
      style: {
        left: Math.random() * 100 + 'vw',
        background: colors[i % colors.length],
        '--dx': (Math.random() * 40 - 20) + 'vw',
        '--r': Math.random() * 900 + 'deg',
        animationDelay: Math.random() * 0.8 + 's',
        animationDuration: 2.4 + Math.random() * 1.8 + 's',
      },
    });
    layer.append(bit);
    setTimeout(() => bit.remove(), 5500);
  }
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
