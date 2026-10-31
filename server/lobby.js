import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChainGame } from './games/chain.js';
import { ClassicGame } from './games/classic.js';
import { CreatorGame } from './games/creator.js';
import { InventGame } from './games/invent.js';
import { clamp, cleanText, makeCode, uid } from './util.js';
import { fetchVideoInfo, parseVideoId } from './youtube.js';

const MAX_PLAYERS = 12;
const MAX_VIDEOS = 80;
const LOBBY_GRACE_MS = 45_000;
const HOST_GRACE_MS = 12_000;
const COLORS = ['#ff4d6d', '#ffd23f', '#35e0d0', '#8b6cff', '#ff9f43', '#b6f34d', '#4dabff', '#ff7ad9', '#ffffff', '#9aa5ff', '#5eead4', '#fca5a5'];
const GAMES = { classic: ClassicGame, invent: InventGame, chain: ChainGame, creator: CreatorGame };

const DEFAULT_SETTINGS = {
  mode: 'classic',
  rounds: 8,
  timeSec: 30,
  clipSec: 0,
  blur: 'strong',
  blurArea: 'face',
  writeSec: 45,
  drawSec: 75,
  chainRounds: 0,
};

const PLAYLIST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'playlists');

function readPlaylist(name) {
  try {
    const file = path.join(PLAYLIST_DIR, path.basename(name) + '.txt');
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).join('\n');
  } catch {
    return null;
  }
}

const publicVideo = (v) => ({ uid: v.uid, id: v.id, title: v.title, author: v.author, by: v.by });

export class Lobby {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.hostId = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.videos = [];
    this.playerVideos = new Map();
    this.game = null;
    this.gid = 0;
    this.drawings = new Map();
    this.lastActive = Date.now();
    this.pending = false;
    this.loadDefaultPool();
  }

  /** La liste intégrée (playlists/default.txt) alimente chaque nouveau lobby. */
  async loadDefaultPool() {
    const text = readPlaylist('default');
    if (text) await this.addVideos({ name: 'liste du jeu', id: null }, text);
  }

  connectedPlayers() {
    return [...this.players.values()].filter((p) => p.connected);
  }

  // ---------- joueurs ----------

  addPlayer(name, avatar) {
    let base = cleanText(name, 16) || 'Joueur';
    let finalName = base;
    for (let i = 2; [...this.players.values()].some((p) => p.name.toLowerCase() === finalName.toLowerCase()); i++) {
      finalName = `${base} ${i}`;
    }
    const player = {
      id: uid(6),
      token: uid(24),
      name: finalName,
      avatar: cleanText(avatar, 8) || '🙂',
      color: COLORS[this.players.size % COLORS.length],
      ws: null,
      connected: false,
      graceTimer: null,
    };
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    return player;
  }

  attach(player, ws) {
    if (player.ws && player.ws !== ws) {
      try { player.ws.close(4000, 'replaced'); } catch {}
    }
    clearTimeout(player.graceTimer);
    if (player.id === this.hostId) clearTimeout(this.hostTimer);
    player.ws = ws;
    player.connected = true;
    this.lastActive = Date.now();
    this.game?.onPlayerChange();
    this.dirty();
  }

  detach(player, ws) {
    if (player.ws !== ws) return;
    player.ws = null;
    player.connected = false;
    this.lastActive = Date.now();
    if (this.hostId === player.id) {
      // Délai de grâce : un simple rechargement de page ne doit pas faire perdre le rôle de chef.
      clearTimeout(this.hostTimer);
      this.hostTimer = setTimeout(() => {
        if (!this.players.get(this.hostId)?.connected) this.promoteHost();
        this.dirty();
      }, HOST_GRACE_MS);
    }
    if (!this.game) {
      player.graceTimer = setTimeout(() => this.removePlayer(player.id), LOBBY_GRACE_MS);
    }
    this.game?.onPlayerChange();
    this.dirty();
  }

  promoteHost() {
    const next = this.connectedPlayers()[0];
    if (next) this.hostId = next.id;
  }

  removePlayer(pid) {
    const player = this.players.get(pid);
    if (!player) return;
    clearTimeout(player.graceTimer);
    if (this.game) {
      // En pleine partie on garde la fiche (scores, réponses) et on le marque absent.
      player.connected = false;
      player.ws = null;
    } else {
      this.players.delete(pid);
      this.playerVideos.delete(pid);
    }
    if (this.hostId === pid) this.promoteHost();
    this.game?.onPlayerChange();
    this.dirty();
  }

  // ---------- messages ----------

  async handle(player, m) {
    this.lastActive = Date.now();
    const isHost = player.id === this.hostId;
    switch (m.t) {
      case 'settings':
        if (isHost && !this.game) this.updateSettings(m);
        break;
      case 'setMyVideo':
        if (!this.game) await this.setMyVideo(player, m.url);
        break;
      case 'clearMyVideo':
        if (!this.game) {
          this.playerVideos.delete(player.id);
          this.dirty();
        }
        break;
      case 'start':
        if (isHost && !this.game) this.start(player);
        break;
      case 'backToLobby':
        if (isHost && this.game) this.endGame();
        break;
      case 'kick':
        if (isHost && m.pid !== player.id) this.kick(m.pid);
        break;
      case 'g':
        this.game?.onAction(player.id, m);
        break;
    }
  }

  updateSettings(m) {
    const s = this.settings;
    if (['classic', 'invent', 'chain', 'creator'].includes(m.mode)) s.mode = m.mode;
    if ('rounds' in m) s.rounds = clamp(m.rounds, 1, 40, s.rounds);
    if ('timeSec' in m) s.timeSec = clamp(m.timeSec, 10, 120, s.timeSec);
    if ('clipSec' in m && [0, 5, 10, 15].includes(Number(m.clipSec))) s.clipSec = Number(m.clipSec);
    if ('blur' in m && ['medium', 'strong', 'max'].includes(m.blur)) s.blur = m.blur;
    if ('blurArea' in m && ['face', 'full'].includes(m.blurArea)) s.blurArea = m.blurArea;
    if ('writeSec' in m) s.writeSec = clamp(m.writeSec, 15, 120, s.writeSec);
    if ('drawSec' in m) s.drawSec = clamp(m.drawSec, 30, 180, s.drawSec);
    if ('chainRounds' in m) s.chainRounds = clamp(m.chainRounds, 0, 11, s.chainRounds);
    this.dirty();
  }

  async resolveVideo(token, by) {
    const id = parseVideoId(token);
    if (!id) return { error: 'lien invalide' };
    let title = '';
    let author = '';
    try {
      ({ title, author } = await fetchVideoInfo(id));
    } catch {
      /* titre à compléter à la main */
    }
    return { video: { uid: uid(6), id, title, author, by, frac: 0.15 + Math.random() * 0.45 } };
  }

  async addVideos(player, urls) {
    const tokens = String(Array.isArray(urls) ? urls.join('\n') : urls ?? '')
      .split(/[\s,;]+/)
      .filter(Boolean)
      .slice(0, 40);
    const seen = new Set(this.videos.map((v) => v.id));
    const fresh = [];
    let invalid = 0;
    for (const t of tokens) {
      const id = parseVideoId(t);
      if (!id) { invalid++; continue; }
      if (!seen.has(id)) { seen.add(id); fresh.push(t); }
    }
    const room = MAX_VIDEOS - this.videos.length;
    const results = [];
    const queue = fresh.slice(0, room);
    for (let i = 0; i < queue.length; i += 5) {
      results.push(...(await Promise.all(queue.slice(i, i + 5).map((t) => this.resolveVideo(t, player.name)))));
    }
    if (this.game) return;
    let missing = 0;
    for (const r of results) {
      if (!r.video) continue;
      if (!r.video.title) missing++;
      this.videos.push(r.video);
    }
    if (invalid) this.notify(player, `${invalid} lien(s) YouTube non reconnu(s).`);
    if (missing) this.notify(player, `Titre introuvable pour ${missing} vidéo(s) : complète-le à la main.`);
    if (fresh.length > room) this.notify(player, `Limite de ${MAX_VIDEOS} vidéos atteinte.`);
    this.dirty();
  }

  async setMyVideo(player, url) {
    const { video, error } = await this.resolveVideo(url, player.name);
    if (!video) return this.notify(player, `Impossible : ${error}.`);
    if (!video.title) this.notify(player, 'Titre introuvable : ce n’est pas grave, on utilisera le lien.');
    if (this.game) return;
    this.playerVideos.set(player.id, video);
    this.dirty();
  }

  // ---------- parties ----------

  start(host) {
    const s = this.settings;
    const players = this.connectedPlayers();
    const fail = (msg) => this.notify(host, msg, 'error');
    if (s.mode === 'chain') {
      if (players.length < 3) return fail('Il faut au moins 3 joueurs pour le mode Téléphone arabe.');
      const lazy = players.filter((p) => !this.playerVideos.has(p.id));
      if (lazy.length) return fail(`En attente d’une vidéo de : ${lazy.map((p) => p.name).join(', ')}.`);
    } else if (s.mode === 'creator') {
      if (!this.videos.some((v) => v.author)) return fail('La base de vidéos est vide.');
    } else {
      if (!this.videos.some((v) => s.mode === 'invent' || v.title)) return fail('La base de vidéos est vide.');
    }
    this.drawings.clear();
    this.game = new GAMES[s.mode](this);
    this.game.start();
    this.dirty();
  }

  endGame() {
    this.game?.destroy();
    this.game = null;
    this.drawings.clear();
    this.dirty();
  }

  kick(pid) {
    const target = this.players.get(pid);
    if (!target) return;
    this.send(target, { t: 'kicked' });
    const ws = target.ws;
    this.removePlayer(pid);
    this.players.delete(pid);
    try { ws?.close(4001, 'kicked'); } catch {}
    this.dirty();
  }

  destroy() {
    this.game?.destroy();
    clearTimeout(this.hostTimer);
    for (const p of this.players.values()) clearTimeout(p.graceTimer);
  }

  // ---------- envoi ----------

  send(player, msg) {
    if (player.ws?.readyState === 1) player.ws.send(JSON.stringify(msg));
  }

  notify(player, msg, kind = 'info') {
    this.send(player, { t: 'toast', msg, kind });
  }

  dirty() {
    if (this.pending) return;
    this.pending = true;
    setTimeout(() => {
      this.pending = false;
      this.flush();
    }, 0);
  }

  flush() {
    for (const p of this.players.values()) {
      if (p.ws?.readyState === 1) p.ws.send(JSON.stringify({ t: 'state', s: this.viewFor(p) }));
    }
  }

  viewFor(player) {
    const mine = this.playerVideos.get(player.id);
    return {
      now: Date.now(),
      code: this.code,
      me: player.id,
      hostId: this.hostId,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
        connected: p.connected,
        hasVideo: this.playerVideos.has(p.id),
      })),
      settings: this.settings,
      // La base de vidéos est un secret du jeu : personne ne la voit, pas même le chef.
      videoCount: this.videos.length,
      myVideo: mine ? publicVideo(mine) : null,
      phase: this.game ? 'game' : 'lobby',
      game: this.game ? this.game.view(player.id) : null,
    };
  }
}

export class LobbyManager {
  constructor() {
    this.lobbies = new Map();
    setInterval(() => this.sweep(), 60_000).unref();
  }

  create() {
    const lobby = new Lobby(makeCode((c) => this.lobbies.has(c)));
    this.lobbies.set(lobby.code, lobby);
    return lobby;
  }

  get(code) {
    return this.lobbies.get(String(code ?? '').trim().toUpperCase());
  }

  sweep() {
    for (const [code, lobby] of this.lobbies) {
      if (!lobby.connectedPlayers().length && Date.now() - lobby.lastActive > 15 * 60_000) {
        lobby.destroy();
        this.lobbies.delete(code);
      }
    }
  }
}

export { MAX_PLAYERS };
