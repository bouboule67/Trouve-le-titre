const ID_RE = /^[\w-]{11}$/;
const URL_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtube-nocookie\.com\/embed\/)([\w-]{11})/i;

export function parseVideoId(input) {
  const text = String(input ?? '').trim();
  if (ID_RE.test(text)) return text;
  const match = URL_RE.exec(text);
  return match ? match[1] : null;
}

const cache = new Map();
const thumbCache = new Map();

/** Miniature YouTube servie depuis notre domaine, pour que le navigateur puisse analyser l'image. */
export async function fetchThumbnail(id, size) {
  const key = `${id}/${size}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const res = await fetch(`https://i.ytimg.com/vi/${id}/${size}.jpg`, { signal: AbortSignal.timeout(8000) });
  const entry = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  thumbCache.set(key, entry);
  if (thumbCache.size > 300) thumbCache.delete(thumbCache.keys().next().value);
  return entry;
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

async function viaOembed(id) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`oembed ${res.status}`);
  const data = await res.json();
  return { title: String(data.title || ''), author: String(data.author_name || '') };
}

// Repli pour les vidéos dont l'intégration est désactivée (oEmbed renvoie 401).
async function viaWatchPage(id) {
  const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
    signal: AbortSignal.timeout(8000),
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'accept-language': 'fr-FR,fr;q=0.9',
      cookie: 'CONSENT=YES+1; SOCS=CAI',
    },
  });
  if (!res.ok) throw new Error(`watch ${res.status}`);
  const html = await res.text();
  const title = /<meta property="og:title" content="([^"]*)"/.exec(html)?.[1];
  const author = /<link itemprop="name" content="([^"]*)"/.exec(html)?.[1];
  if (!title) throw new Error('titre introuvable');
  return { title: decodeEntities(title), author: decodeEntities(author || '') };
}

/** Récupère titre + chaîne d'une vidéo sans clé d'API. */
export async function fetchVideoInfo(id) {
  if (cache.has(id)) return cache.get(id);
  let info;
  try {
    info = await viaOembed(id);
  } catch {
    info = await viaWatchPage(id);
  }
  cache.set(id, info);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return info;
}
