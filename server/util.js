import crypto from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function makeCode(exists) {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!exists(code)) return code;
  }
}

export const uid = (n = 8) => crypto.randomBytes(n).toString('base64url').slice(0, n);

export function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const NOISE = /(vevo|officiel|official|channel|chaine|topic)$/;

/** Tolère les accents, la casse, les petites fautes et les noms partiels. */
export function matchesName(guess, target) {
  const g = normalize(guess);
  if (g.length < 2) return false;
  const full = normalize(target);
  for (const t of new Set([full, full.replace(NOISE, '')])) {
    if (!t) continue;
    if (g === t) return true;
    const shortest = Math.min(g.length, t.length);
    const longest = Math.max(g.length, t.length);
    if (shortest >= 3 && shortest >= longest * 0.6 && (t.includes(g) || g.includes(t))) return true;
    if (t.length >= 4 && levenshtein(g, t) <= Math.floor(t.length / 4)) return true;
  }
  return false;
}

const STOP_TOKENS = new Set(['official', 'officiel', 'officielle', 'music', 'musique', 'channel', 'chaine', 'topic', 'vevo', 'the', 'les', 'des', 'tv', 'video', 'videos', 'clip', 'fait', 'france', 'gaming', 'game', 'games', 'studio', 'studios', 'productions', 'show', 'live', 'stream']);

/** Variantes du nom de chaîne à chercher dans un titre (comparaison sans accents ni ponctuation). */
function nameVariants(author) {
  const variants = new Set();
  const full = normalize(author);
  if (full.length >= 3) {
    variants.add(full);
    const stripped = full.replace(/(vevo|officiel|official|channel|chaine|topic)$/, '');
    if (stripped.length >= 3) variants.add(stripped);
  }
  for (const token of String(author).split(/[^\p{L}\p{N}]+/u)) {
    const t = normalize(token);
    if (t.length >= 4 && !STOP_TOKENS.has(t)) variants.add(t);
  }
  return [...variants].sort((a, b) => b.length - a.length);
}

/**
 * Cache le nom de la chaîne dans le titre : « Squeezie - arrêtez » devient « arrêtez ».
 * Sinon la réponse serait donnée d'avance.
 */
export function maskCreatorName(title, author) {
  const source = String(title ?? '');
  // On aligne une version « compacte » (lettres/chiffres sans accents) sur le texte d'origine.
  const compact = [];
  const positions = [];
  [...source].forEach((ch, i) => {
    const folded = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/[a-z0-9]/.test(folded[0] ?? '')) {
      compact.push(folded[0]);
      positions.push(i);
    }
  });
  const text = compact.join('');
  const chars = [...source];
  const masked = new Array(chars.length).fill(false);
  for (const variant of nameVariants(author)) {
    for (let from = text.indexOf(variant); from !== -1; from = text.indexOf(variant, from + 1)) {
      for (let i = positions[from]; i <= positions[from + variant.length - 1]; i++) masked[i] = true;
    }
  }
  let out = '';
  chars.forEach((ch, i) => {
    out += masked[i] ? (out.endsWith('\u0000') ? '' : '\u0000') : ch;
  });
  out = out
    .replace(/^[\s\-–—|:·•]*\u0000[\s\-–—|:·•]*/, '')
    .replace(/[\s\-–—|:·•]*\u0000[\s\-–—|:·•]*$/, '')
    .replace(/\u0000/g, '▒▒▒')
    .replace(/[(\[]\s*[)\]]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out || '(titre masqué)';
}
