import fs from 'node:fs';
import { fetchVideoInfo, parseVideoId } from '../server/youtube.js';
const ids = [...new Set(fs.readFileSync('playlists/default.txt', 'utf8').split(/\s+/).map(parseVideoId).filter(Boolean))];
let ok = 0, bad = [];
for (let i = 0; i < ids.length; i += 6) await Promise.all(ids.slice(i, i + 6).map(async (id) => { try { const v = await fetchVideoInfo(id); if (v.title && v.author) ok++; else bad.push(id + ' (infos incomplètes)'); } catch (e) { bad.push(id + ' ' + e.message); } }));
console.log(`${ids.length} vidéos uniques, ${ok} lues correctement`, bad.length ? '\nProblèmes :\n' + bad.join('\n') : '');
