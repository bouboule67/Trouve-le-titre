import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'playlists', 'default.txt');
const CACHE_MS = 60_000;

let cached = null;

function fromFile() {
  try {
    return fs.readFileSync(FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).join('\n');
  } catch {
    return '';
  }
}

async function fromSupabase() {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_KEY;
  if (!base || !key) return null;
  const res = await fetch(`${base}/rest/v1/videos?select=url&active=eq.true&limit=1000`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  const rows = await res.json();
  return rows.map((r) => r.url).join('\n');
}

/**
 * Liens des vidéos du jeu : table `videos` de Supabase si elle est configurée,
 * sinon le fichier playlists/default.txt. Mis en cache une minute.
 */
export async function loadVideoLinks() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.text;
  let text = null;
  try {
    text = await fromSupabase();
  } catch (err) {
    console.error('[supabase]', err.message, '→ repli sur playlists/default.txt');
  }
  if (!text) text = fromFile();
  cached = { text, at: Date.now() };
  return text;
}
