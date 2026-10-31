export const store = {
  state: null,
  status: 'connecting', // connecting | online | offline
  offset: 0,
  listeners: new Set(),

  set(state) {
    this.state = state;
    if (state) this.offset = state.now - Date.now();
    this.emit();
  },

  setStatus(status) {
    this.status = status;
    this.emit();
  },

  /** Heure du serveur : tous les timers s'appuient dessus. */
  now() {
    return Date.now() + this.offset;
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  emit() {
    for (const fn of this.listeners) fn(this.state);
  },

  player(id) {
    return this.state?.players.find((p) => p.id === id);
  },

  get isHost() {
    return !!this.state && this.state.me === this.state.hostId;
  },
};
