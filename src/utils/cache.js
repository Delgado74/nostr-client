export class ProfileCache {
  constructor() {
    this.profiles = new Map();
  }

  set(pubkey, profile) {
    this.profiles.set(pubkey, {
      ...profile,
      updated_at: Date.now()
    });
  }

  get(pubkey) {
    return this.profiles.get(pubkey) || null;
  }

  has(pubkey) {
    return this.profiles.has(pubkey);
  }

  getAll() {
    return Object.fromEntries(this.profiles);
  }
}

export class EventCache {
  constructor(maxSize = 1000) {
    this.events = new Map();
    this.maxSize = maxSize;
  }

  add(event) {
    if (this.events.size >= this.maxSize) {
      const oldestKey = this.events.keys().next().value;
      this.events.delete(oldestKey);
    }
    this.events.set(event.id, event);
  }

  get(eventId) {
    return this.events.get(eventId) || null;
  }

  getByAuthor(pubkey) {
    return [...this.events.values()]
      .filter(e => e.pubkey === pubkey)
      .sort((a, b) => b.created_at - a.created_at);
  }

  getReplies(eventId) {
    return [...this.events.values()]
      .filter(e => e.tags.some(t => t[0] === 'e' && t[1] === eventId))
      .sort((a, b) => a.created_at - b.created_at);
  }
}
