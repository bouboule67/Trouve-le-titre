import { Game } from './base.js';
import { cleanText, shuffle } from '../util.js';

const INTRO_MS = 3000;
const COLLECT_MS = 3500;
const MAX_IMAGE_CHARS = 1_000_000;
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

/**
 * Mode 2 – « Téléphone arabe » façon Gartic Phone.
 * Chaque joueur apporte une vidéo. Les chaînes tournent : titre → dessin → titre → …
 * Rien n'est dévoilé avant le reveal final.
 */
export class ChainGame extends Game {
  constructor(lobby) {
    super(lobby);
    const s = lobby.settings;
    this.mode = 'chain';
    this.gid = ++lobby.gid;
    this.order = shuffle(this.participants);
    this.n = this.order.length;
    this.rounds = Math.min(this.n - 1, s.chainRounds || 99);
    this.writeSec = s.writeSec;
    this.drawSec = s.drawSec;
    this.chains = this.order.map((pid) => ({
      owner: pid,
      steps: [{ type: 'thumb', pid, video: lobby.playerVideos.get(pid) }],
    }));
    this.round = -1;
    this.subs = new Map(); // pid -> { text?, img?, done }
    this.responded = new Set();
    this.pointer = { ci: 0, si: 0 };
  }

  start() {
    this.nextRound();
  }

  kind(round = this.round) {
    return round % 2 === 0 ? 'title' : 'draw';
  }

  /** Index de la chaîne que `pid` traite à la manche `round`. */
  chainIndex(pid, round = this.round) {
    const i = this.order.indexOf(pid);
    return (((i - 1 - round) % this.n) + this.n) % this.n;
  }

  nextRound() {
    this.round++;
    if (this.round >= this.rounds) return this.startReveal();
    this.phase = 'intro';
    this.subs = new Map();
    this.endsAt = Date.now() + INTRO_MS;
    this.after(INTRO_MS, () => this.beginPlay());
    this.dirty();
  }

  beginPlay() {
    const ms = (this.kind() === 'title' ? this.writeSec : this.drawSec) * 1000;
    this.phase = 'play';
    this.endsAt = Date.now() + ms;
    this.playTimer = this.after(ms, () => this.collect());
    this.dirty();
  }

  collect() {
    this.phase = 'collect';
    this.endsAt = Date.now() + COLLECT_MS;
    this.responded.clear();
    this.collectTimer = this.after(COLLECT_MS, () => this.closeRound());
    this.dirty();
    this.onPlayerChange();
  }

  onPlayerChange() {
    const active = this.active();
    if (!active.length) return;
    if (this.phase === 'play' && active.every((id) => this.subs.get(id)?.done)) {
      this.cancel(this.playTimer);
      this.closeRound();
    } else if (this.phase === 'collect' && active.every((id) => this.subs.get(id)?.done || this.responded.has(id))) {
      this.cancel(this.collectTimer);
      this.closeRound();
    }
  }

  onAction(pid, m) {
    if (!this.participants.includes(pid)) return;
    if (m.a === 'submit') return this.submit(pid, m);
    if (m.a === 'unsubmit') return this.unsubmit(pid);
    if (m.a === 'next' && this.isHost(pid)) return this.revealNext();
  }

  submit(pid, m) {
    if (this.phase !== 'play' && this.phase !== 'collect') return;
    const prev = this.subs.get(pid);
    if (this.phase === 'collect' && prev?.done) return;
    const sub = { done: true };
    if (this.kind() === 'title') {
      sub.text = cleanText(m.text, 150);
    } else if (typeof m.img === 'string' && m.img.length <= MAX_IMAGE_CHARS && IMAGE_RE.test(m.img)) {
      sub.img = m.img;
    }
    this.subs.set(pid, sub);
    if (this.phase === 'collect') this.responded.add(pid);
    this.dirty();
    this.onPlayerChange();
  }

  unsubmit(pid) {
    if (this.phase !== 'play') return;
    const sub = this.subs.get(pid);
    if (sub) sub.done = false;
    this.dirty();
  }

  closeRound() {
    const kind = this.kind();
    this.chains.forEach((chain, c) => {
      const pid = this.order[(c + 1 + this.round) % this.n];
      const sub = this.subs.get(pid);
      if (kind === 'title') {
        chain.steps.push({ type: 'title', pid, text: sub?.text || '…' });
      } else {
        let img = null;
        const match = sub?.img && IMAGE_RE.exec(sub.img);
        if (match) {
          const key = `${this.gid}-${c}-${this.round}`;
          this.lobby.drawings.set(key, { type: `image/${match[1]}`, buf: Buffer.from(match[2], 'base64') });
          img = `/d/${this.lobby.code}/${key}`;
        }
        chain.steps.push({ type: 'draw', pid, img });
      }
    });
    this.nextRound();
  }

  // ---------- reveal ----------

  startReveal() {
    this.phase = 'reveal';
    this.pointer = { ci: 0, si: 0 };
    this.dirty();
  }

  revealNext() {
    if (this.phase !== 'reveal') return;
    const { ci, si } = this.pointer;
    if (si < this.chains[ci].steps.length - 1) this.pointer = { ci, si: si + 1 };
    else if (ci < this.chains.length - 1) this.pointer = { ci: ci + 1, si: 0 };
    else this.phase = 'final';
    this.dirty();
  }

  view(pid) {
    const base = {
      mode: 'chain',
      phase: this.phase,
      endsAt: this.endsAt,
      round: this.round,
      rounds: this.rounds,
      participants: this.participants,
    };
    if (this.phase === 'intro') return { ...base, kind: this.kind() };
    if (this.phase === 'play' || this.phase === 'collect') {
      const last = this.chains[this.chainIndex(pid)]?.steps.at(-1);
      const sub = this.subs.get(pid);
      return {
        ...base,
        kind: this.kind(),
        totalSec: this.kind() === 'title' ? this.writeSec : this.drawSec,
        collecting: this.phase === 'collect',
        prompt: last && { type: last.type, videoId: last.video?.id, img: last.img, text: last.text },
        done: !!sub?.done,
        doneIds: this.participants.filter((p) => this.subs.get(p)?.done),
      };
    }
    const chains = this.chains.map((chain) => ({
      owner: chain.owner,
      steps: chain.steps.map((s) =>
        s.type === 'thumb'
          ? { type: 'thumb', pid: s.pid, video: { id: s.video.id, title: s.video.title, author: s.video.author } }
          : { type: s.type, pid: s.pid, text: s.text, img: s.img },
      ),
    }));
    return { ...base, chains, pointer: this.pointer };
  }
}
