import { Game } from './base.js';
import { cleanText, maskCreatorName, matchesName, shuffle } from '../util.js';

const INTRO_MS = 2500;
const REVEAL_MS = 9000;
const WRAP_MS = 1200;

/**
 * Mode 3 – « Qui a sorti ça ? » : miniature floutée + titre, on devine la chaîne.
 * Les points dépendent de la rapidité.
 */
export class CreatorGame extends Game {
  constructor(lobby) {
    super(lobby);
    const s = lobby.settings;
    this.mode = 'creator';
    this.videos = shuffle(lobby.videos.filter((v) => v.author)).slice(0, s.rounds);
    this.timeSec = s.timeSec;
    this.blur = s.blur;
    this.blurArea = s.blurArea;
    this.round = -1;
    this.scores = new Map(this.participants.map((p) => [p, 0]));
    this.state = new Map(); // pid -> { correct, attempts, lastWrong, points, at }
    this.hint = '';
    this.final = null;
  }

  start() {
    this.nextRound();
  }

  nextRound() {
    this.round++;
    if (this.round >= this.videos.length) return this.finish();
    this.phase = 'intro';
    this.state = new Map();
    this.hint = '';
    this.endsAt = Date.now() + INTRO_MS;
    this.after(INTRO_MS, () => this.beginPlay());
    this.dirty();
  }

  beginPlay() {
    const ms = this.timeSec * 1000;
    const name = this.videos[this.round].author;
    this.phase = 'play';
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + ms;
    this.playTimer = this.after(ms, () => this.reveal());
    // Indices : la longueur du nom aux 40 %, puis la première lettre aux 70 %.
    const mask = (reveal) =>
      [...name].map((c, i) => (c === ' ' ? ' ' : i === 0 && reveal ? c : '•')).join('');
    this.after(ms * 0.4, () => { this.hint = mask(false); this.dirty(); });
    this.after(ms * 0.7, () => { this.hint = mask(true); this.dirty(); });
    this.dirty();
  }

  reveal() {
    this.cancel(this.playTimer);
    this.phase = 'reveal';
    this.endsAt = Date.now() + REVEAL_MS;
    this.revealTimer = this.after(REVEAL_MS, () => this.nextRound());
    this.dirty();
  }

  onPlayerChange() {
    if (this.phase !== 'play') return;
    const active = this.active();
    if (active.length && active.every((id) => this.state.get(id)?.correct) && !this.wrapTimer) {
      this.wrapTimer = this.after(WRAP_MS, () => {
        this.wrapTimer = null;
        if (this.phase === 'play') this.reveal();
      });
    }
  }

  onAction(pid, m) {
    if (!this.participants.includes(pid)) return;
    if (m.a === 'guess') return this.guess(pid, m);
    if (m.a === 'skip' && this.isHost(pid) && this.phase === 'reveal') {
      this.cancel(this.revealTimer);
      this.nextRound();
    }
  }

  guess(pid, m) {
    if (this.phase !== 'play') return;
    const st = this.state.get(pid) || { correct: false, attempts: 0, lastWrong: '', points: 0, at: 0 };
    if (st.correct) return;
    const text = cleanText(m.text, 60);
    if (!text) return;
    st.attempts++;
    if (matchesName(text, this.videos[this.round].author)) {
      const total = this.endsAt - this.startedAt;
      const remaining = Math.max(0, this.endsAt - Date.now()) / total;
      const rank = [...this.state.values()].filter((s) => s.correct).length;
      st.correct = true;
      st.at = Date.now() - this.startedAt;
      st.points = Math.round(500 + 500 * remaining + Math.max(0, 150 - rank * 75));
      st.lastWrong = '';
      this.scores.set(pid, (this.scores.get(pid) || 0) + st.points);
    } else {
      st.lastWrong = text;
    }
    this.state.set(pid, st);
    this.dirty();
    this.onPlayerChange();
  }

  finish() {
    const ranking = this.participants
      .map((pid) => ({ pid, total: this.scores.get(pid) || 0 }))
      .sort((a, b) => b.total - a.total);
    this.final = { ranking };
    this.phase = 'final';
    this.dirty();
  }

  view(pid) {
    const base = {
      mode: 'creator',
      phase: this.phase,
      endsAt: this.endsAt,
      round: this.round,
      total: this.videos.length,
      timeSec: this.timeSec,
      blur: this.blur,
      blurArea: this.blurArea,
      participants: this.participants,
      scores: Object.fromEntries(this.scores),
    };
    if (this.phase === 'intro') return base;
    if (this.phase === 'play') {
      const v = this.videos[this.round];
      const mine = this.state.get(pid);
      return {
        ...base,
        // La chaîne reste secrète : on la retire aussi du titre.
        video: { id: v.id, title: maskCreatorName(v.title, v.author) },
        hint: this.hint,
        startedAt: this.startedAt,
        my: mine ? { correct: mine.correct, attempts: mine.attempts, lastWrong: mine.lastWrong, points: mine.points } : null,
        solvedIds: this.participants.filter((p) => this.state.get(p)?.correct),
      };
    }
    if (this.phase === 'reveal') {
      const v = this.videos[this.round];
      return {
        ...base,
        video: { id: v.id, title: v.title, author: v.author },
        results: this.participants.map((p) => {
          const st = this.state.get(p);
          return { pid: p, correct: !!st?.correct, points: st?.points || 0, at: st?.at || 0 };
        }),
        last: this.round === this.videos.length - 1,
      };
    }
    return { ...base, final: this.final };
  }
}
