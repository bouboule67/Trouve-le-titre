import { h } from '../dom.js';
import { store } from '../store.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const W = 640;
const H = 360;

let detectorPromise;
function getDetector() {
  detectorPromise ||= (async () => {
    const vision = await import(`${MP}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    return vision.FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.3,
    });
  })();
  detectorPromise.catch(() => { detectorPromise = null; });
  return detectorPromise;
}

/** Charge le modèle à l'avance pour que la première miniature ne soit pas retardée. */
export const warmUpFaceDetector = () => getDetector().catch(() => {});

async function loadThumb(id) {
  for (const size of ['maxresdefault', 'sddefault', 'hqdefault']) {
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => (img.naturalWidth > 120 ? resolve(img) : reject());
        img.onerror = reject;
        img.src = `/thumb/${id}/${size}`;
      });
    } catch { /* taille suivante */ }
  }
  throw new Error('miniature introuvable');
}

// Zones analysées en plus de l'image entière, pour retrouver les visages plus petits.
const PASSES = [
  { x: 0, y: 0, w: 1, h: 1 },
  { x: 0, y: 0, w: 0.6, h: 0.6 },
  { x: 0.4, y: 0, w: 0.6, h: 0.6 },
  { x: 0, y: 0.4, w: 0.6, h: 0.6 },
  { x: 0.4, y: 0.4, w: 0.6, h: 0.6 },
];

/** Visages en coordonnées relatives (0..1) de la zone visible (recadrage 16:9 centré, comme object-fit: cover). */
function detectFaces(detector, image) {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  let vw = iw;
  let vh = (iw * 9) / 16;
  if (vh > ih) { vh = ih; vw = (ih * 16) / 9; }
  const ox = (iw - vw) / 2;
  const oy = (ih - vh) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const found = [];
  for (const p of PASSES) {
    ctx.drawImage(image, ox + p.x * vw, oy + p.y * vh, p.w * vw, p.h * vh, 0, 0, W, H);
    for (const { boundingBox: b, categories } of detector.detect(canvas).detections) {
      if ((categories?.[0]?.score ?? 1) < 0.45) continue;
      found.push({
        cx: p.x + ((b.originX + b.width / 2) / W) * p.w,
        cy: p.y + ((b.originY + b.height / 2) / H) * p.h,
        w: (b.width / W) * p.w,
        h: (b.height / H) * p.h,
      });
    }
  }
  // Fusion des doublons : on garde le plus grand quand un centre tombe dans un visage déjà retenu.
  const kept = [];
  for (const f of found.sort((a, b) => b.w * b.h - a.w * a.h)) {
    const dup = kept.some((k) => Math.abs(f.cx - k.cx) < k.w * 0.7 && Math.abs(f.cy - k.cy) < k.h * 0.7);
    if (!dup) kept.push(f);
  }
  // Le youtubeur (et ses potes) sont au premier plan : on ne garde que les visages d'une taille
  // comparable au plus gros. Les passants et figurants du fond restent nets.
  const biggest = kept[0] ? kept[0].w * kept[0].h : 0;
  return kept.filter((f) => f.w * f.h >= biggest * 0.4).slice(0, 4);
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(reject, ms))]);

/**
 * Miniature dont seuls les visages sont floutés (le flou diminue avec le temps).
 * Tant que l'analyse n'est pas finie, toute l'image reste floue : rien ne fuite.
 * Si l'analyse échoue, on garde le flou intégral.
 */
export function faceBlurThumb(videoId, { full, face, total, startedAt, area }) {
  const img = h('img', { alt: '', draggable: false });
  const layer = h('div', { class: 'face-layer' });
  const el = h('div', { class: 'thumb thumb-xl face-thumb is-blur' }, img, layer);
  el.style.setProperty('--b0', full[0] + 'px');
  el.style.setProperty('--b1', full[1] + 'px');
  el.style.setProperty('--f0', face[0] + 'px');
  el.style.setProperty('--f1', face[1] + 'px');
  el.style.setProperty('--dur', total + 'ms');
  el.style.setProperty('--delay', -Math.max(0, store.now() - startedAt) + 'ms');
  let dead = false;

  (async () => {
    try {
      const image = await loadThumb(videoId);
      if (dead) return;
      img.src = image.src;
      if (area === 'full') return;
      const detector = await withTimeout(getDetector(), 10000);

      const faces = detectFaces(detector, image);
      if (dead) return;

      el.style.setProperty('--delay', -Math.max(0, store.now() - startedAt) + 'ms');
      for (const f of faces) {
        // On élargit largement : cheveux, front, menton, barbe et oreilles doivent disparaître.
        const w = f.w * 1.9;
        const hh = f.h * 2.2;
        layer.append(h('i', {
          style: {
            left: (f.cx - w / 2) * 100 + '%',
            top: (f.cy - hh / 2 - f.h * 0.08) * 100 + '%',
            width: w * 100 + '%',
            height: hh * 100 + '%',
          },
        }));
      }
      el.classList.remove('is-blur');
    } catch {
      /* flou intégral conservé */
    }
  })();

  return { el, destroy: () => { dead = true; } };
}
