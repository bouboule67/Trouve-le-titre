/** Socle commun des modes : timers, joueurs actifs, accès à l'hôte. */
export class Game {
  constructor(lobby) {
    this.lobby = lobby;
    this.participants = lobby.connectedPlayers().map((p) => p.id);
    this.timers = new Set();
    this.phase = 'intro';
    this.endsAt = 0;
  }

  after(ms, fn) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  cancel(t) {
    if (!t) return;
    clearTimeout(t);
    this.timers.delete(t);
  }

  destroy() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  dirty() {
    this.lobby.dirty();
  }

  isHost(pid) {
    return pid === this.lobby.hostId;
  }

  /** Participants toujours connectés : ce sont ceux qu'on attend. */
  active() {
    return this.participants.filter((id) => this.lobby.players.get(id)?.connected);
  }

  onPlayerChange() {}
}
