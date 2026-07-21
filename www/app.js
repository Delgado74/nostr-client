// ============================================
// NostraIsla - App Principal
// ============================================

import { generatePrivateKey, getPublicKey, getNpub, getNsec } from './src/utils/crypto.js';
import { createNote, createReply, createProfile, createReaction, createRepost } from './src/utils/event.js';
import Relay from './src/relay/connection.js';
import { ProfileCache, EventCache } from './src/utils/cache.js';

// ============================================
// Estado de la aplicación
// ============================================
const state = {
  currentAccount: null,
  accounts: [],
  relays: ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'],
  relayConnections: [],
  profileCache: new ProfileCache(),
  eventCache: new EventCache(),
  currentScreen: 'login',
  dmRecipient: null,
  viewingEvent: null
};

// ============================================
// Persistencia (localStorage)
// ============================================
function saveAccounts() {
  localStorage.setItem('nostra_isla_accounts', JSON.stringify(state.accounts));
  localStorage.setItem('nostra_isla_relays', JSON.stringify(state.relays));
}

function loadAccounts() {
  try {
    const accounts = localStorage.getItem('nostra_isla_accounts');
    const relays = localStorage.getItem('nostra_isla_relays');
    if (accounts) state.accounts = JSON.parse(accounts);
    if (relays) state.relays = JSON.parse(relays);
  } catch (e) {
    console.error('Error loading accounts:', e);
  }
}

// ============================================
// Utilidades
// ============================================
function $(id) { return document.getElementById(id); }

function showToast(message, type = '') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function parseProfile(content) {
  try { return JSON.parse(content); }
  catch { return { name: 'Anónimo', about: '' }; }
}

function formatTime(timestamp) {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function shortId(id) {
  return id ? id.slice(0, 8) : '?';
}

// ============================================
// Navegación entre pantallas
// ============================================
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = $(`screen-${screenId}`);
  if (screen) {
    screen.classList.add('active');
    state.currentScreen = screenId;
  }

  // Mostrar/ocultar bottom nav
  const bottomNav = $('bottom-nav');
  const screensWithNav = ['main', 'compose', 'messages', 'profile'];
  if (screensWithNav.includes(screenId) && state.currentAccount) {
    bottomNav.classList.remove('hidden');
  } else {
    bottomNav.classList.add('hidden');
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === screenId);
  });
}

// ============================================
// Menú lateral
// ============================================
function openSideMenu() {
  $('side-menu').classList.add('open');
  $('side-menu-overlay').classList.remove('hidden');
  setTimeout(() => $('side-menu-overlay').classList.add('visible'), 10);
}

function closeSideMenu() {
  $('side-menu').classList.remove('open');
  $('side-menu-overlay').classList.remove('visible');
  setTimeout(() => $('side-menu-overlay').classList.add('hidden'), 300);
}

// ============================================
// Conexión a relays
// ============================================
async function connectToRelays() {
  $('connection-status').className = 'status-dot disconnected';

  for (const url of state.relays) {
    try {
      const relay = new Relay(url);
      await relay.connect();
      state.relayConnections.push(relay);
    } catch (e) {
      console.log(`No se pudo conectar a ${url}`);
    }
  }

  if (state.relayConnections.length > 0) {
    $('connection-status').className = 'status-dot connected';
    showToast(`Conectado a ${state.relayConnections.length} relay(s)`, 'success');
    subscribeToFeed();
  } else {
    showToast('No se pudo conectar a ningún relay', 'error');
  }
}

function publish(event) {
  state.relayConnections.forEach(r => r.publish(event));
}

// ============================================
// Suscripciones
// ============================================
function subscribeToFeed() {
  const subId = 'main-feed';
  const filters = [
    { kinds: [1], limit: 20 },
    { kinds: [0], limit: 30 },
    { kinds: [7], limit: 50 },
    { kinds: [6], limit: 20 },
    { kinds: [4], limit: 20 }
  ];

  state.relayConnections.forEach(r => {
    r.subscribe(subId, filters, (event) => {
      state.eventCache.add(event);

      if (event.kind === 0) {
        const profile = parseProfile(event.content);
        state.profileCache.set(event.pubkey, profile);
        return;
      }

      if (event.kind === 1) {
        addEventToFeed(event);
      }
    });
  });
}

function addEventToFeed(event) {
  const feed = $('feed-events');
  if (!feed) return;

  const isReply = event.tags.some(t => t[0] === 'e');
  const profile = state.profileCache.get(event.pubkey);
  const name = profile?.name || event.pubkey.slice(0, 8);
  const nip05 = profile?.nip05 || '';

  let replyIndicator = '';
  if (isReply) {
    const rootTag = event.tags.find(t => t[3] === 'root');
    const replyToId = rootTag ? rootTag[1] : event.tags.find(t => t[0] === 'e')?.[1];
    replyIndicator = `<div class="event-reply-indicator">↘ Respondiendo a ${shortId(replyToId)}</div>`;
  }

  const nip05Badge = nip05 ? `<span class="nip05-badge">✓ ${nip05}</span>` : '';

  const card = document.createElement('div');
  card.className = 'event-card';
  card.dataset.eventId = event.id;
  card.innerHTML = `
    ${replyIndicator}
    <div class="event-header">
      <div class="event-avatar">${profile?.picture ? `<img src="${profile.picture}" style="width:40px;height:40px;border-radius:50%">` : '👤'}</div>
      <div>
        <span class="event-author">${name}</span>${nip05Badge}
      </div>
      <span class="event-time">${formatTime(event.created_at)}</span>
    </div>
    <div class="event-content">${escapeHtml(event.content)}</div>
    <div class="event-tags">
      <span class="event-tag reply" data-action="reply" data-id="${event.id}">💬 Responder</span>
      <span class="event-tag reaction" data-action="react" data-id="${event.id}">❤ ${getReactionCount(event.id)}</span>
      <span class="event-tag repost" data-action="repost" data-id="${event.id}">🔁 ${getRepostCount(event.id)}</span>
    </div>
  `;

  card.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    const eventId = e.target.dataset.id;

    if (action === 'reply') {
      startReply(state.eventCache.get(eventId));
    } else if (action === 'react') {
      reactToEvent(state.eventCache.get(eventId));
    } else if (action === 'repost') {
      repostEvent(state.eventCache.get(eventId));
    } else {
      showEventDetail(event);
    }
  });

  feed.prepend(card);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getReactionCount(eventId) {
  return [...state.eventCache.events.values()]
    .filter(e => e.kind === 7 && e.tags.some(t => t[0] === 'e' && t[1] === eventId))
    .length;
}

function getRepostCount(eventId) {
  return [...state.eventCache.events.values()]
    .filter(e => e.kind === 6 && e.tags.some(t => t[0] === 'e' && t[1] === eventId))
    .length;
}

function showEventDetail(event) {
  const profile = state.profileCache.get(event.pubkey);
  const name = profile?.name || event.pubkey.slice(0, 8);

  showToast(`${name}: ${event.content.slice(0, 50)}...`);
}

// ============================================
// Publicar nota
// ============================================
function publishNote(content) {
  if (!content.trim() || !state.currentAccount) return;

  const event = createNote(state.currentAccount.privateKey, content);
  publish(event);
  state.eventCache.add(event);
  addEventToFeed(event);
  showToast('Nota publicada', 'success');
}

// ============================================
// Responder
// ============================================
function startReply(targetEvent) {
  if (!targetEvent) return;
  state.viewingEvent = targetEvent;

  const profile = state.profileCache.get(targetEvent.pubkey);
  const name = profile?.name || targetEvent.pubkey.slice(0, 8);

  $('reply-to').innerHTML = `
    <strong>${name}</strong><br>
    ${escapeHtml(targetEvent.content.slice(0, 200))}
  `;
  $('reply-text').value = '';
  $('reply-count').textContent = '0/10000';
  showScreen('reply');
}

function sendReply(content) {
  if (!content.trim() || !state.viewingEvent || !state.currentAccount) return;

  const event = createReply(state.currentAccount.privateKey, content, state.viewingEvent);
  publish(event);
  state.eventCache.add(event);
  showToast('Respuesta publicada', 'success');
  showScreen('main');
}

// ============================================
// Reacciones
// ============================================
async function reactToEvent(targetEvent) {
  if (!targetEvent || !state.currentAccount) return;

  const event = createReaction(state.currentAccount.privateKey, '❤', targetEvent);
  publish(event);
  state.eventCache.add(event);
  showToast('Reacción enviada', 'success');
}

// ============================================
// Repost
// ============================================
async function repostEvent(targetEvent) {
  if (!targetEvent || !state.currentAccount) return;

  const event = createRepost(state.currentAccount.privateKey, targetEvent);
  publish(event);
  state.eventCache.add(event);
  showToast('Repost publicado', 'success');
}

// ============================================
// DMs (NIP-04 básico)
// ============================================
function showDmList() {
  $('dm-chat').classList.add('hidden');
  $('dm-list').classList.remove('hidden');
  $('messages-title').textContent = 'Mensajes directos';
  $('btn-back-messages').classList.add('hidden');

  const dms = [...state.eventCache.events.values()]
    .filter(e => e.kind === 4 && e.pubkey === state.currentAccount?.publicKey ||
                 e.kind === 4 && e.tags.some(t => t[1] === state.currentAccount?.publicKey));

  const dmList = $('dm-list');
  if (dms.length === 0) {
    dmList.innerHTML = `
      <div class="empty-state">
        <p>No hay conversaciones aún</p>
        <button id="btn-new-dm" class="btn btn-secondary">Nuevo mensaje</button>
      </div>
    `;
    $('btn-new-dm').addEventListener('click', () => $('modal-new-dm').classList.remove('hidden'));
  }
}

function openDm(recipientPubkey) {
  state.dmRecipient = recipientPubkey;
  $('dm-chat').classList.remove('hidden');
  $('dm-list').classList.add('hidden');
  $('messages-title').textContent = recipientPubkey.slice(0, 16) + '...';
  $('btn-back-messages').classList.remove('hidden');
  $('dm-messages').innerHTML = '';
}

function sendDm(content) {
  if (!content.trim() || !state.dmRecipient || !state.currentAccount) return;

  // NIP-04 básico: cifrar mensaje
  const dmEvent = {
    kind: 4,
    created_at: Math.floor(Date.now() / 1000),
    content: content, // En producción: cifrar con NIP-04
    tags: [['p', state.dmRecipient]],
    pubkey: state.currentAccount.publicKey
  };

  publish(dmEvent);

  const bubble = document.createElement('div');
  bubble.className = 'dm-bubble sent';
  bubble.innerHTML = `
    ${escapeHtml(content)}
    <div class="dm-bubble-time">${formatTime(dmEvent.created_at)}</div>
  `;
  $('dm-messages').appendChild(bubble);
  $('dm-input').value = '';
}

// ============================================
// Perfil
// ============================================
function loadProfile() {
  if (!state.currentAccount) return;

  $('profile-npub').value = state.currentAccount.npub;
  $('profile-nsec').value = state.currentAccount.nsec;

  // Cargar perfil del caché
  const cached = state.profileCache.get(state.currentAccount.publicKey);
  if (cached) {
    $('profile-name').textContent = cached.name || 'Sin nombre';
    $('profile-about').textContent = cached.about || '';
    if (cached.picture) {
      $('profile-avatar').innerHTML = `<img src="${cached.picture}" style="width:80px;height:80px;border-radius:50%">`;
    }
    if (cached.nip05) {
      $('profile-nip05').textContent = `✓ ${cached.nip05}`;
      $('profile-nip05').classList.remove('hidden');
    }
  }

  $('edit-name').value = cached?.name || '';
  $('edit-about').value = cached?.about || '';
  $('edit-picture').value = cached?.picture || '';
  $('edit-nip05').value = cached?.nip05 || '';
}

function saveProfile() {
  if (!state.currentAccount) return;

  const profileData = {
    name: $('edit-name').value.trim(),
    about: $('edit-about').value.trim(),
    picture: $('edit-picture').value.trim(),
    nip05: $('edit-nip05').value.trim()
  };

  const event = createProfile(state.currentAccount.privateKey, profileData);
  publish(event);
  state.eventCache.add(event);
  state.profileCache.set(state.currentAccount.publicKey, profileData);

  loadProfile();
  showToast('Perfil actualizado', 'success');
  $('profile-edit').classList.add('hidden');
  $('profile-view').classList.remove('hidden');
}

// ============================================
// Cuentas
// ============================================
function createAccount() {
  const privateKey = generatePrivateKey();
  const publicKey = getPublicKey(privateKey);
  const npub = getNpub(publicKey);
  const nsec = getNsec(privateKey);

  const account = {
    privateKey,
    publicKey,
    npub,
    nsec,
    name: 'Nueva cuenta',
    created_at: Date.now()
  };

  state.accounts.push(account);
  state.currentAccount = account;
  saveAccounts();

  showToast('Cuenta creada', 'success');
  return account;
}

function importAccount(nsecInput) {
  try {
    // Validar que empiece con nsec
    if (!nsecInput.startsWith('nsec')) {
      throw new Error('nsec debe comenzar con "nsec"');
    }

    // Por ahora, extraer la clave hex del nsec
    // En producción usar nip19 de nostr-tools
    const hexKey = nsecInput.replace('nsec', '');

    if (hexKey.length !== 64) {
      throw new Error('nsec inválido');
    }

    const publicKey = getPublicKey(hexKey);
    const npub = getNpub(publicKey);

    const account = {
      privateKey: hexKey,
      publicKey,
      npub,
      nsec: nsecInput,
      name: 'Cuenta importada',
      created_at: Date.now()
    };

    state.accounts.push(account);
    state.currentAccount = account;
    saveAccounts();

    showToast('Cuenta importada', 'success');
    return account;
  } catch (e) {
    showToast(e.message, 'error');
    return null;
  }
}

function switchAccount(index) {
  if (index >= 0 && index < state.accounts.length) {
    state.currentAccount = state.accounts[index];
    saveAccounts();
    loadProfile();
    showToast('Cuenta cambiada', 'success');
    showScreen('profile');
  }
}

function removeAccount(index) {
  state.accounts.splice(index, 1);
  if (state.accounts.length > 0) {
    state.currentAccount = state.accounts[0];
  } else {
    state.currentAccount = null;
  }
  saveAccounts();
  renderAccounts();
}

function renderAccounts() {
  const list = $('accounts-list');
  list.innerHTML = state.accounts.map((acc, i) => `
    <div class="account-item ${acc.publicKey === state.currentAccount?.publicKey ? 'active' : ''}"
         data-index="${i}">
      <div>
        <div class="account-name">${acc.name}</div>
        <div class="account-npub">${acc.npub.slice(0, 30)}...</div>
      </div>
      <button class="relay-remove" data-remove="${i}">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.account-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.dataset.remove) {
        switchAccount(parseInt(item.dataset.index));
      }
    });
  });

  list.querySelectorAll('.relay-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeAccount(parseInt(btn.dataset.remove));
    });
  });
}

// ============================================
// Relays
// ============================================
function renderRelays() {
  const list = $('relays-list');
  list.innerHTML = state.relays.map((url, i) => `
    <div class="relay-item">
      <span>${url}</span>
      <button class="relay-remove" data-index="${i}">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.relay-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.relays.splice(parseInt(btn.dataset.index), 1);
      saveAccounts();
      renderRelays();
    });
  });
}

function addRelay(url) {
  if (!url.trim() || !url.startsWith('wss://')) {
    showToast('URL debe comenzar con wss://', 'error');
    return;
  }
  if (state.relays.includes(url)) {
    showToast('Relay ya existe', 'error');
    return;
  }
  state.relays.push(url);
  saveAccounts();
  renderRelays();
  showToast('Relay agregado', 'success');
}

// ============================================
// Inicialización
// ============================================
function init() {
  loadAccounts();

  if (state.accounts.length > 0) {
    state.currentAccount = state.accounts[0];
    $('screen-login').classList.remove('active');
    showScreen('main');
    connectToRelays();
  }

  // Login
  $('btn-create-account').addEventListener('click', () => {
    createAccount();
    $('screen-login').classList.remove('active');
    showScreen('main');
    connectToRelays();
  });

  $('btn-import-account').addEventListener('click', () => {
    $('import-form').classList.toggle('hidden');
  });

  $('btn-import-confirm').addEventListener('click', () => {
    const nsec = $('input-nsec').value.trim();
    if (importAccount(nsec)) {
      $('screen-login').classList.remove('active');
      showScreen('main');
      connectToRelays();
    }
  });

  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen;
      showScreen(screen);

      if (screen === 'profile') loadProfile();
      if (screen === 'messages') showDmList();
    });
  });

  // Compose
  $('btn-back-compose').addEventListener('click', () => showScreen('main'));

  $('compose-text').addEventListener('input', (e) => {
    $('compose-count').textContent = `${e.target.value.length}/10000`;
  });

  $('btn-publish').addEventListener('click', () => {
    publishNote($('compose-text').value);
    $('compose-text').value = '';
    showScreen('main');
  });

  // Reply
  $('btn-back-reply').addEventListener('click', () => showScreen('main'));

  $('reply-text').addEventListener('input', (e) => {
    $('reply-count').textContent = `${e.target.value.length}/10000`;
  });

  $('btn-reply-send').addEventListener('click', () => {
    sendReply($('reply-text').value);
  });

  // DMs
  $('btn-back-messages').addEventListener('click', () => showDmList());

  $('btn-new-dm')?.addEventListener('click', () => {
    $('modal-new-dm').classList.remove('hidden');
  });

  $('btn-cancel-dm').addEventListener('click', () => {
    $('modal-new-dm').classList.add('hidden');
  });

  $('btn-send-dm').addEventListener('click', () => {
    const recipient = $('dm-recipient').value.trim();
    const message = $('dm-message').value.trim();
    if (recipient && message) {
      $('modal-new-dm').classList.add('hidden');
      openDm(recipient);
      sendDm(message);
    }
  });

  $('btn-dm-send').addEventListener('click', () => {
    sendDm($('dm-input').value);
  });

  $('dm-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendDm($('dm-input').value);
  });

  // Profile
  $('btn-back-profile')?.addEventListener('click', () => showScreen('main'));

  $('btn-edit-profile').addEventListener('click', () => {
    $('profile-view').classList.add('hidden');
    $('profile-edit').classList.remove('hidden');
    $('accounts-view').classList.add('hidden');
  });

  $('btn-save-profile').addEventListener('click', saveProfile);

  // Copy buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.dataset.copy;
      const input = $(inputId);
      navigator.clipboard.writeText(input.value).then(() => {
        showToast('Copiado al portapapeles', 'success');
      }).catch(() => {
        input.select();
        document.execCommand('copy');
        showToast('Copiado', 'success');
      });
    });
  });

  // Toggle nsec visibility
  $('btn-toggle-nsec').addEventListener('click', () => {
    const nsecInput = $('profile-nsec');
    const isPassword = nsecInput.type === 'password';
    nsecInput.type = isPassword ? 'text' : 'password';
    $('btn-toggle-nsec').textContent = isPassword ? '🔒' : '👁️';
  });

  $('btn-manage-accounts').addEventListener('click', () => {
    $('profile-view').classList.add('hidden');
    $('accounts-view').classList.remove('hidden');
    $('profile-edit').classList.add('hidden');
    renderAccounts();
  });

  $('btn-add-account').addEventListener('click', () => {
    createAccount();
    renderAccounts();
  });

  $('btn-logout').addEventListener('click', () => {
    state.currentAccount = null;
    state.relayConnections.forEach(r => r.close());
    state.relayConnections = [];
    $('screen-main').classList.remove('active');
    $('screen-profile').classList.remove('active');
    $('screen-compose').classList.remove('active');
    $('screen-messages').classList.remove('active');
    showScreen('login');
    showToast('Sesión cerrada');
  });

  // Settings
  $('btn-back-settings')?.addEventListener('click', () => showScreen('main'));

  $('btn-add-relay').addEventListener('click', () => {
    addRelay($('input-new-relay').value);
    $('input-new-relay').value = '';
  });

  renderRelays();

  // Side menu
  $('btn-menu').addEventListener('click', openSideMenu);
  $('btn-close-menu').addEventListener('click', closeSideMenu);
  $('side-menu-overlay').addEventListener('click', closeSideMenu);

  document.querySelectorAll('.side-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      closeSideMenu();

      if (action === 'settings') showScreen('settings');
      if (action === 'logout') {
        state.currentAccount = null;
        state.relayConnections.forEach(r => r.close());
        state.relayConnections = [];
        showScreen('login');
        showToast('Sesión cerrada');
      }
      if (action === 'about') showToast('NostraIsla v1.0 - Cliente Nostr');
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
