import { Game } from './base.js';
import { clamp, cleanText, shuffle } from '../util.js';

const INTRO_MS = 2500;
const COLLECT_MS = 1500;
const AUTO_NEXT_MS = 1800;

/**
 * Mode 1 – « Petit bac » : une miniature, le titre est caché, chacun écrit le sien.
 * Puis review : chaque réponse est notée sur 5 par les autres joueurs.
 */
export class ClassicGame extends Game {
  constructor(lobby) {
    super(lobby);
    const s = lobby.settings;
    this.mode = 'classic';
    this.videos = shuffle(lobby.videos.filter((v) => s.mode === 'invent' || v.title)).slice(0, s.rounds);
    this.timeSec = s.timeSec;
    this.clipSec = s.clipSec;
    this.round = -1;
    this.answers = this.videos.map(() => new Map()); // pid -> { text, done }
    this.votes = this.videos.map(() => new Map()); // author -> Map(voter -> note)
    this.responded = new Set();
    this.steps = [];
    this.step = 0;
    this.final = null;
  }

  start() {
    this.nextRound();
  }

  nextRound() {
    this.round++;
    if (this.round >= this.videos.length) return this.startReview();
    this.phase = 'intro';
    this.endsAt = Date.now() + INTRO_MS;
    this.after(INTRO_MS, () => this.beginPlay());
    this.dirty();
  }

  beginPlay() {
    const ms = this.timeSec * 1000;
    this.phase = 'play';
    this.endsAt = Date.now() + ms;
    this.playTimer = this.after(ms, () => this.collect());
    this.dirty();
  }

  // Le temps est écoulé : on laisse une seconde aux clients pour envoyer leur brouillon.
  collect() {
    this.phase = 'collect';
    this.endsAt = Date.now() + COLLECT_MS;
    this.responded.clear();
    this.collectTimer = this.after(COLLECT_MS, () => this.nextRound());
    this.dirty();
    this.onPlayerChange();
  }

  onPlayerChange() {
    const active = this.active();
    if (!active.length) return;
    if (this.phase === 'play') {
      const answers = this.answers[this.round];
      if (active.every((id) => answers.get(id)?.done)) {
        this.cancel(this.playTimer);
        this.nextRound();
      }
    } else if (this.phase === 'collect') {
      if (active.every((id) => this.responded.has(id))) {
        this.cancel(this.collectTimer);
        this.nextRound();
      }
    } else if (this.phase === 'review') {
      this.checkAllVoted();
    }
  }

  onAction(pid, m) {
    if (!this.participants.includes(pid)) return;
    if (m.a === 'answer') return this.answer(pid, m);
    if (m.a === 'vote') return this.vote(pid, m);
    if (m.a === 'next' && this.isHost(pid)) return this.advance();
  }

  answer(pid, m) {
    if (this.phase !== 'play' && this.phase !== 'collect') return;
    const rec = this.answers[this.round].get(pid) || { text: '', done: false };
    if (typeof m.text === 'string') rec.text = cleanText(m.text, 120);
    if (this.phase === 'play') {
      rec.done = !!m.done && rec.text.length > 0;
    } else {
      rec.done = true;
      this.responded.add(pid);
    }
    this.answers[this.round].set(pid, rec);
    this.dirty();
    this.onPlayerChange();
  }

  // ---------- review ----------

  startReview() {
    this.phase = 'review';
    this.steps = [];
    this.videos.forEach((_, v) => {
      const authors = shuffle(this.participants.filter((p) => this.answers[v].get(p)?.text));
      if (!authors.length) this.steps.push({ v, author: null });
      else authors.forEach((author) => this.steps.push({ v, author }));
    });
    this.step = 0;
    this.dirty();
  }

  currentVotes() {
    const s = this.steps[this.step];
    return s && s.author ? this.votes[s.v].get(s.author) : null;
  }

  eligible() {
    const s = this.steps[this.step];
    return this.active().filter((p) => p !== s.author);
  }

  allVoted() {
    const s = this.steps[this.step];
    if (!s || !s.author) return false;
    const eligible = this.eligible();
    const votes = this.currentVotes();
    return eligible.length > 0 && !!votes && eligible.every((p) => votes.has(p));
  }

  vote(pid, m) {
    if (this.phase !== 'review') return;
    const s = this.steps[this.step];
    if (!s || !s.author || pid === s.author) return;
    const note = clamp(m.n, 1, 5, 0);
    if (!note) return;
    const byAuthor = this.votes[s.v];
    if (!byAuthor.has(s.author)) byAuthor.set(s.author, new Map());
    byAuthor.get(s.author).set(pid, note);
    this.dirty();
    this.checkAllVoted();
  }

  checkAllVoted() {
    if (this.phase === 'review' && this.allVoted() && !this.autoTimer) {
      const step = this.step;
      this.autoTimer = this.after(AUTO_NEXT_MS, () => {
        this.autoTimer = null;
        if (this.step === step) this.advance();
      });
    }
  }

  advance() {
    if (this.phase !== 'review') return;
    this.cancel(this.autoTimer);
    this.autoTimer = null;
    if (this.step < this.steps.length - 1) {
      this.step++;
      this.dirty();
    } else {
      this.finish();
    }
  }

  finish() {
    const totals = new Map(this.participants.map((pid) => [pid, { pid, total: 0, count: 0 }]));
    let best = null;
    const recap = this.videos.map((video, v) => {
      const answers = [];
      for (const pid of this.participants) {
        const rec = this.answers[v].get(pid);
        if (!rec?.text) continue;
        const notes = [...(this.votes[v].get(pid)?.values() ?? [])];
        const sum = notes.reduce((a, b) => a + b, 0);
        const avg = notes.length ? sum / notes.length : null;
        const t = totals.get(pid);
        t.total += sum;
        t.count += notes.length;
        answers.push({ pid, text: rec.text, avg });
        if (avg !== null && (!best || avg > best.avg || (avg === best.avg && notes.length > best.votes))) {
          best = { pid, text: rec.text, avg, votes: notes.length, title: video.title };
        }
      }
      answers.sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
      return { video: this.mode === 'invent' ? { id: video.id, title: '' } : { id: video.id, title: video.title, author: video.author }, answers };
    });
    const ranking = [...totals.values()].sort((a, b) => b.total - a.total);
    this.final = { ranking, best, recap };
    this.phase = 'final';
    this.dirty();
  }

  // ---------- vue envoyée à chaque joueur ----------

  view(pid) {
    const base = {
      mode: this.mode,
      phase: this.phase,
      endsAt: this.endsAt,
      round: this.round,
      total: this.videos.length,
      timeSec: this.timeSec,
      clipSec: this.clipSec,
      participants: this.participants,
    };
    if (this.phase === 'play' || this.phase === 'collect') {
      const v = this.videos[this.round];
      const answers = this.answers[this.round];
      return {
        ...base,
        // Le titre n'est volontairement jamais envoyé pendant la manche.
        video: { id: v.id, frac: v.frac },
        my: answers.get(pid) || null,
        doneIds: this.participants.filter((p) => answers.get(p)?.done),
        collecting: this.phase === 'collect',
      };
    }
    if (this.phase === 'intro') {
      return { ...base, video: { id: this.videos[this.round].id } };
    }
    if (this.phase === 'review') {
      const s = this.steps[this.step];
      const v = this.videos[s.v];
      const votes = this.currentVotes();
      const allVoted = this.allVoted();
      let avg = null;
      if (allVoted) avg = [...votes.values()].reduce((a, b) => a + b, 0) / votes.size;
      return {
        ...base,
        step: this.step,
        steps: this.steps.length,
        v: s.v,
        firstOfVideo: this.step === 0 || this.steps[this.step - 1].v !== s.v,
        video: this.mode === 'invent' ? { id: v.id } : { id: v.id, title: v.title, author: v.author },
        author: s.author,
        text: s.author ? this.answers[s.v].get(s.author).text : null,
        myVote: votes?.get(pid) || 0,
        voted: votes ? votes.size : 0,
        eligible: s.author ? this.eligible().length : 0,
        allVoted,
        avg,
        last: this.step === this.steps.length - 1,
      };
    }
    return { ...base, final: this.final };
  }
}
