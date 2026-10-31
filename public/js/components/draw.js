import { h } from '../dom.js';

const W = 800;
const H = 450;
const COLORS = ['#111111', '#ffffff', '#8a8a8a', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff2d92', '#a2845e', '#7a3e00'];
const SIZES = [4, 10, 20, 40];
const MAX_HISTORY = 20;

/** Planche à dessin : crayon, gomme, pot de peinture, annuler, tout effacer. */
export function drawPad() {
  const canvas = h('canvas', { width: W, height: H, class: 'pad-canvas' });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let color = COLORS[0];
  let size = SIZES[1];
  let tool = 'pen';
  let drawing = false;
  let last = null;
  let dirty = false;
  const history = [];

  const snapshot = () => {
    history.push(ctx.getImageData(0, 0, W, H));
    if (history.length > MAX_HISTORY) history.shift();
  };

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const stroke = (from, to) => {
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const floodFill = (sx, sy, hex) => {
    const img = ctx.getImageData(0, 0, W, H);
    const px = img.data;
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const at = (x, y) => (y * W + x) * 4;
    const start = at(x0, y0);
    const base = [px[start], px[start + 1], px[start + 2]];
    const fill = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    if (base.every((v, i) => Math.abs(v - fill[i]) < 4)) return;
    const seen = new Uint8Array(W * H);
    const near = (i) => !seen[i >> 2] && Math.abs(px[i] - base[0]) + Math.abs(px[i + 1] - base[1]) + Math.abs(px[i + 2] - base[2]) < 90;
    const stack = [[x0, y0]];
    while (stack.length) {
      let [x, y] = stack.pop();
      if (!near(at(x, y))) continue;
      while (x >= 0 && near(at(x, y))) x--;
      x++;
      let up = false;
      let down = false;
      while (x < W && near(at(x, y))) {
        const i = at(x, y);
        seen[i >> 2] = 1;
        px[i] = fill[0]; px[i + 1] = fill[1]; px[i + 2] = fill[2]; px[i + 3] = 255;
        if (y > 0) {
          const n = near(at(x, y - 1));
          if (n && !up) { stack.push([x, y - 1]); up = true; } else if (!n) up = false;
        }
        if (y < H - 1) {
          const n = near(at(x, y + 1));
          if (n && !down) { stack.push([x, y + 1]); down = true; } else if (!n) down = false;
        }
        x++;
      }
    }
    ctx.putImageData(img, 0, 0);
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = pos(e);
    snapshot();
    dirty = true;
    if (tool === 'fill') return floodFill(p.x, p.y, color);
    drawing = true;
    last = p;
    canvas.setPointerCapture(e.pointerId);
    stroke(p, { x: p.x + 0.01, y: p.y });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    stroke(last, p);
    last = p;
  });
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // ----- barre d'outils -----
  const swatches = COLORS.map((c) =>
    h('button', {
      type: 'button',
      class: 'swatch',
      style: { background: c },
      'aria-label': c,
      onClick: () => {
        color = c;
        if (tool === 'eraser') setTool('pen');
        paintTools();
      },
    }),
  );
  const sizeButtons = SIZES.map((s) =>
    h('button', { type: 'button', class: 'size-btn', 'aria-label': `Taille ${s}`, onClick: () => { size = s; paintTools(); } },
      h('i', { style: { width: Math.min(s, 26) + 'px', height: Math.min(s, 26) + 'px' } })),
  );
  const toolButtons = {
    pen: h('button', { type: 'button', class: 'tool-btn', onClick: () => setTool('pen') }, '✏️ Crayon'),
    fill: h('button', { type: 'button', class: 'tool-btn', onClick: () => setTool('fill') }, '🪣 Remplir'),
    eraser: h('button', { type: 'button', class: 'tool-btn', onClick: () => setTool('eraser') }, '🧽 Gomme'),
  };
  const setTool = (t) => { tool = t; canvas.dataset.tool = t; paintTools(); };
  function paintTools() {
    swatches.forEach((s, i) => s.classList.toggle('on', tool !== 'eraser' && COLORS[i] === color));
    sizeButtons.forEach((b, i) => b.classList.toggle('on', SIZES[i] === size));
    Object.entries(toolButtons).forEach(([k, b]) => b.classList.toggle('on', k === tool));
  }

  const undo = h('button', {
    type: 'button',
    class: 'tool-btn',
    onClick: () => {
      const prev = history.pop();
      if (prev) ctx.putImageData(prev, 0, 0);
    },
  }, '↩️ Annuler');
  const wipe = h('button', {
    type: 'button',
    class: 'tool-btn',
    onClick: () => {
      snapshot();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
    },
  }, '🗑️ Effacer');

  const el = h('div', { class: 'pad' },
    h('div', { class: 'pad-stage' }, canvas),
    h('div', { class: 'pad-tools' },
      h('div', { class: 'swatches' }, swatches),
      h('div', { class: 'pad-row' }, sizeButtons, h('span', { class: 'pad-sep' }), Object.values(toolButtons), h('span', { class: 'pad-sep' }), undo, wipe),
    ),
  );
  paintTools();

  return {
    el,
    isBlank: () => !dirty,
    lock(locked) {
      el.classList.toggle('locked', locked);
    },
    toDataURL: () => canvas.toDataURL('image/jpeg', 0.82),
  };
}
