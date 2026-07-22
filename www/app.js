// ============================================
// NostraIsla - App Principal
// ============================================

import { generatePrivateKey, getPublicKey, getNpub, getNsec } from './src/utils/crypto.js';
import { createNote, createReply, createProfile, createReaction, createRepost, createEvent } from './src/utils/event.js';
import Relay from './src/relay/connection.js';
import { ProfileCache, EventCache } from './src/utils/cache.js';
import { decodeBech32 } from './src/utils/bech32.js';
import { encrypt, decrypt } from './src/utils/nip04.js';

// ============================================
// Estado de la aplicación
// ============================================
const state = {
  currentAccount: null,
  accounts: [],
  relays: ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band', 'wss://relay.mostro.network'],
  relayConnections: [],
  profileCache: new ProfileCache(),
  eventCache: new EventCache(),
  currentScreen: 'login',
  dmRecipient: null,
  renderedDmIds: new Set(),
  viewingEvent: null,
  viewingUserProfile: null
};

// ============================================
// Persistencia (localStorage)
// ============================================
function saveAccounts() {
  state.accounts = state.accounts.map(acc => {
    if (acc.privateKey && acc.publicKey) {
      acc.npub = getNpub(acc.publicKey);
      acc.nsec = getNsec(acc.privateKey);
    }
    return acc;
  });
  localStorage.setItem('nostra_isla_accounts', JSON.stringify(state.accounts));
  localStorage.setItem('nostra_isla_relays', JSON.stringify(state.relays));
}

function loadAccounts() {
  try {
    const accounts = localStorage.getItem('nostra_isla_accounts');
    const relays = localStorage.getItem('nostra_isla_relays');
    if (accounts) {
      state.accounts = JSON.parse(accounts).map(acc => {
        if (acc.privateKey && acc.publicKey) {
          acc.npub = getNpub(acc.publicKey);
          acc.nsec = getNsec(acc.privateKey);
        }
        return acc;
      });
    }
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
  const screenMap = { feed: 'main' };
  const mappedId = screenMap[screenId] || screenId;

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = $(`screen-${mappedId}`);
  if (screen) {
    screen.classList.add('active');
    state.currentScreen = screenId;
  }

  if (screenId === 'settings') {
    renderRelays();
  }

  // Mostrar/ocultar bottom nav
  const bottomNav = $('bottom-nav');
  const screensWithNav = ['feed', 'compose', 'messages', 'profile'];
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

  const promises = state.relays.map(async (url) => {
    try {
      const relay = new Relay(url);
      relay.onOk = (eventId, status, msg, relayUrl) => {
        const short = eventId.slice(0, 8);
        if (status) {
          showToast(`✓ Nota aceptada en ${new URL(relayUrl).hostname}`, 'success');
        } else {
          showToast(`✗ Rechazada en ${new URL(relayUrl).hostname}: ${msg}`, 'error');
        }
      };
      relay.onNotice = (notice, relayUrl) => {
        showToast(`Aviso: ${notice}`, 'error');
      };
      await relay.connect();
      return relay;
    } catch (e) {
      console.log(`No se pudo conectar a ${url}`);
      return null;
    }
  });

  const results = await Promise.all(promises);
  state.relayConnections = results.filter(r => r !== null);

  if (state.relayConnections.length > 0) {
    $('connection-status').className = 'status-dot connected';
    const names = state.relayConnections.map(r => new URL(r.url).hostname).join(', ');
    showToast(`Conectado: ${names}`, 'success');
    subscribeToFeed();
    publishInitialProfile();
  } else {
    showToast('No se pudo conectar a ningún relay', 'error');
  }
}

function publishInitialProfile() {
  if (!state.currentAccount) return;

  const cached = state.profileCache.get(state.currentAccount.publicKey);
  if (cached && cached.name) return;

  const profileData = {
    name: 'NostraIsla User',
    about: ''
  };

  const event = createProfile(state.currentAccount.privateKey, profileData);
  publish(event);
  state.profileCache.set(state.currentAccount.publicKey, profileData);
}

function publish(event) {
  state.relayConnections.forEach(r => r.publish(event));
}

// ============================================
// Suscripciones
// ============================================
function subscribeToFeed() {
  const subId = 'main-feed';
  const pubHex = state.currentAccount?.publicKey;
  const filters = [
    { authors: [pubHex], kinds: [0], limit: 1 },
    { kinds: [0], limit: 30 },
    { kinds: [1], limit: 20 },
    { kinds: [7], limit: 50 },
    { kinds: [6], limit: 20 },
    { kinds: [4], authors: [pubHex], limit: 50 },
    { kinds: [4], '#p': [pubHex], limit: 50 }
  ];

  state.relayConnections.forEach(r => {
    r.subscribe(subId, filters, (event) => {
      state.eventCache.add(event);

      if (event.kind === 0) {
        const profile = parseProfile(event.content);
        state.profileCache.set(event.pubkey, profile);
        if (event.pubkey === pubHex) {
          loadProfile();
        }
        return;
      }

      if (event.kind === 1) {
        addEventToFeed(event);
      }

      if (event.kind === 4) {
        onIncomingDm(event);
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

function fallbackCopy(text, btn) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('Copiado al portapapeles', 'success');
  } catch (e) {
    showToast('No se pudo copiar. Selecciona manualmente.', 'error');
  }
  document.body.removeChild(textarea);
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

  if (state.relayConnections.length === 0) {
    showToast('No hay relays conectados. Espera...', 'error');
    return;
  }

  const event = createNote(state.currentAccount.privateKey, content);
  publish(event);
  state.eventCache.add(event);
  addEventToFeed(event);
  showToast('Nota enviada a ' + state.relayConnections.length + ' relay(s)...', 'success');
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
  showScreen('feed');
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
// DMs (NIP-04 cifrado)
// ============================================
function getDmParties(event) {
  const sender = event.pubkey;
  const receiver = event.tags.find(t => t[0] === 'p')?.[1];
  return { sender, receiver };
}

function isSentByMe(event) {
  return event.pubkey === state.currentAccount?.publicKey;
}

async function decryptDmContent(event) {
  const { sender, receiver } = getDmParties(event);
  const isMine = isSentByMe(event);
  try {
    if (isMine) {
      return await decrypt(event.content, state.currentAccount.privateKey, receiver);
    } else {
      return await decrypt(event.content, state.currentAccount.privateKey, sender);
    }
  } catch {
    return '[No se pudo descifrar]';
  }
}

async function showDmList() {
  $('dm-chat').classList.add('hidden');
  $('dm-list').classList.remove('hidden');
  $('messages-title').textContent = 'Mensajes directos';
  $('btn-back-messages').classList.add('hidden');

  const dms = [...state.eventCache.events.values()]
    .filter(e => e.kind === 4 && (
      e.pubkey === state.currentAccount?.publicKey ||
      e.tags.some(t => t[1] === state.currentAccount?.publicKey)
    ));

  const dmList = $('dm-list');
  dmList.innerHTML = '';

  const newDmBtn = document.createElement('div');
  newDmBtn.className = 'dm-item';
  newDmBtn.innerHTML = '<div class="dm-avatar">✏️</div><div class="dm-info"><div class="dm-name">Nuevo mensaje</div></div>';
  newDmBtn.addEventListener('click', () => $('modal-new-dm').classList.remove('hidden'));
  dmList.appendChild(newDmBtn);

  if (dms.length === 0) {
    return;
  }

  // Agrupar por conversación (la otra persona)
  const conversations = new Map();
  for (const dm of dms) {
    const { sender, receiver } = getDmParties(dm);
    const otherPubkey = isSentByMe(dm) ? receiver : sender;
    if (!conversations.has(otherPubkey) || dm.created_at > conversations.get(otherPubkey).created_at) {
      conversations.set(otherPubkey, dm);
    }
  }

  for (const [otherPubkey, lastDm] of conversations) {
    const decrypted = await decryptDmContent(lastDm);
    const profile = state.profileCache.get(otherPubkey);
    const name = profile?.name || otherPubkey.slice(0, 12);

    const item = document.createElement('div');
    item.className = 'dm-item';
    item.innerHTML = `
      <div class="dm-avatar">${profile?.picture ? `<img src="${profile.picture}" style="width:48px;height:48px;border-radius:50%">` : '👤'}</div>
      <div class="dm-info">
        <div class="dm-name">${escapeHtml(name)}</div>
        <div class="dm-last-message">${escapeHtml(decrypted).slice(0, 60)}${decrypted.length > 60 ? '...' : ''}</div>
      </div>
    `;
    item.addEventListener('click', () => openDm(otherPubkey));
    dmList.appendChild(item);
  }
}

function normalizePubkey(input) {
  if (input.startsWith('npub') || input.startsWith('nsec')) {
    try { return decodeBech32(input); } catch { return input; }
  }
  return input;
}

async function openDm(recipientPubkey) {
  state.dmRecipient = normalizePubkey(recipientPubkey);
  state.renderedDmIds = new Set();
  $('dm-chat').classList.remove('hidden');
  $('dm-list').classList.add('hidden');
  const profile = state.profileCache.get(state.dmRecipient);
  $('messages-title').textContent = profile?.name || state.dmRecipient.slice(0, 16) + '...';
  $('btn-back-messages').classList.remove('hidden');
  $('dm-messages').innerHTML = '';

  // Cargar historial de esta conversación
  const dms = [...state.eventCache.events.values()]
    .filter(e => e.kind === 4 && (
      (e.pubkey === state.dmRecipient && e.tags.some(t => t[1] === state.currentAccount?.publicKey)) ||
      (e.pubkey === state.currentAccount?.publicKey && e.tags.some(t => t[1] === state.dmRecipient))
    ))
    .sort((a, b) => a.created_at - b.created_at);

  for (const dm of dms) {
    state.renderedDmIds.add(dm.id);
    const decrypted = await decryptDmContent(dm);
    const isMine = isSentByMe(dm);
    const bubble = document.createElement('div');
    bubble.className = `dm-bubble ${isMine ? 'sent' : 'received'}`;
    bubble.innerHTML = `
      ${escapeHtml(decrypted)}
      <div class="dm-bubble-time">${formatTime(dm.created_at)}</div>
    `;
    $('dm-messages').appendChild(bubble);
  }

  // Scroll al final
  $('dm-messages').scrollTop = $('dm-messages').scrollHeight;
}

async function sendDm(content) {
  if (!content.trim() || !state.dmRecipient || !state.currentAccount) return;

  try {
    const encrypted = await encrypt(content, state.currentAccount.privateKey, state.dmRecipient);

    const dmEvent = createEvent(state.currentAccount.privateKey, 4, encrypted, [['p', state.dmRecipient]]);

    publish(dmEvent);
    state.renderedDmIds.add(dmEvent.id);

    const bubble = document.createElement('div');
    bubble.className = 'dm-bubble sent';
    bubble.innerHTML = `
      ${escapeHtml(content)}
      <div class="dm-bubble-time">${formatTime(dmEvent.created_at)}</div>
    `;
    $('dm-messages').appendChild(bubble);
    $('dm-input').value = '';
  } catch (err) {
    console.error('Error al cifrar DM:', err);
    showToast('Error al enviar mensaje cifrado', 'error');
  }
}

async function onIncomingDm(event) {
  if (!state.currentAccount) return;
  const { sender, receiver } = getDmParties(event);
  const isMine = isSentByMe(event);
  const otherPubkey = isMine ? receiver : sender;

  if (!state.dmRecipient || normalizePubkey(otherPubkey) !== state.dmRecipient) {
    if (!isMine) {
      const profile = state.profileCache.get(sender);
      const name = profile?.name || sender.slice(0, 8);
      showToast(`DM de ${name}`, 'info');
    }
    return;
  }

  if (state.renderedDmIds.has(event.id)) return;
  state.renderedDmIds.add(event.id);

  const decrypted = await decryptDmContent(event);
  const bubble = document.createElement('div');
  bubble.className = `dm-bubble ${isMine ? 'sent' : 'received'}`;
  bubble.innerHTML = `
    ${escapeHtml(decrypted)}
    <div class="dm-bubble-time">${formatTime(event.created_at)}</div>
  `;
  $('dm-messages').appendChild(bubble);
  $('dm-messages').scrollTop = $('dm-messages').scrollHeight;
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
  try {
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
  } catch (e) {
    console.error('Error creando cuenta:', e);
    showToast('Error al crear cuenta: ' + e.message, 'error');
    return null;
  }
}

function importAccount(nsecInput) {
  try {
    if (!nsecInput.startsWith('nsec')) {
      throw new Error('nsec debe comenzar con "nsec"');
    }

    const hexKey = decodeBech32(nsecInput);

    if (hexKey.length !== 64) {
      throw new Error('nsec inválido: longitud incorrecta');
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
    console.error('Error importando cuenta:', e);
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
  const connectedUrls = state.relayConnections.map(r => r.url);

  const statusEl = $('relays-status');
  if (statusEl) {
    statusEl.textContent = `${connectedUrls.length} de ${state.relays.length} relays conectados`;
    statusEl.className = connectedUrls.length > 0 ? 'relays-status ok' : 'relays-status error';
  }

  const list = $('relays-list');
  list.innerHTML = state.relays.map((url, i) => {
    const connected = connectedUrls.includes(url);
    const host = new URL(url).hostname;
    return `
    <div class="relay-item">
      <span class="relay-status-dot ${connected ? 'connected' : 'disconnected'}"></span>
      <span class="relay-url">${host}</span>
      <button class="relay-remove" data-index="${i}">×</button>
    </div>
  `}).join('');

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
// Buscar usuario por npub
// ============================================
function searchUserProfile(hexPubkey) {
  state.viewingUserProfile = hexPubkey;
  showScreen('user-profile');
  $('user-profile-name').textContent = 'Buscando...';
  $('user-profile-about').textContent = '';
  $('user-profile-avatar').innerHTML = '👤';
  $('user-profile-nip05').classList.add('hidden');
  $('user-profile-npub').textContent = 'npub1' + hexPubkey.slice(0, 20) + '...';
  $('user-profile-feed').innerHTML = '';

  const subId = 'user-search-' + hexPubkey.slice(0, 8);
  const filters = [
    { authors: [hexPubkey], kinds: [0], limit: 1 },
    { authors: [hexPubkey], kinds: [1], limit: 20 }
  ];

  state.relayConnections.forEach(r => {
    r.subscribe(subId, filters, (event) => {
      state.eventCache.add(event);

      if (event.kind === 0) {
        const profile = parseProfile(event.content);
        state.profileCache.set(event.pubkey, profile);
        $('user-profile-name').textContent = profile.name || 'Sin nombre';
        if (profile.about) $('user-profile-about').textContent = profile.about;
        if (profile.picture) {
          $('user-profile-avatar').innerHTML = `<img src="${profile.picture}" style="width:80px;height:80px;border-radius:50%">`;
        }
        if (profile.nip05) {
          $('user-profile-nip05').textContent = `✓ ${profile.nip05}`;
          $('user-profile-nip05').classList.remove('hidden');
        }
      }

      if (event.kind === 1) {
        const feed = $('user-profile-feed');
        const profile = state.profileCache.get(hexPubkey);
        const name = profile?.name || hexPubkey.slice(0, 8);

        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
          <div class="event-header">
            <div class="event-avatar">${profile?.picture ? `<img src="${profile.picture}" style="width:40px;height:40px;border-radius:50%">` : '👤'}</div>
            <div>
              <span class="event-author">${escapeHtml(name)}</span>
            </div>
            <span class="event-time">${formatTime(event.created_at)}</span>
          </div>
          <div class="event-content">${escapeHtml(event.content)}</div>
        `;
        feed.prepend(card);
      }
    });
  });

  setTimeout(() => {
    state.relayConnections.forEach(r => r.unsubscribe(subId));
  }, 5000);
}

// ============================================
// Inicialización
// ============================================
function init() {
  console.log('NostraIsla: Módulos cargados correctamente');
  loadAccounts();

  if (state.accounts.length > 0) {
    state.currentAccount = state.accounts[0];
    $('screen-login').classList.remove('active');
    showScreen('feed');
    connectToRelays();
  }

  // Login
  $('btn-create-account').addEventListener('click', () => {
    const account = createAccount();
    if (account) {
      $('screen-login').classList.remove('active');
      showScreen('feed');
      connectToRelays();
    }
  });

  $('btn-import-account').addEventListener('click', () => {
    $('import-form').classList.toggle('hidden');
  });

  $('btn-import-confirm').addEventListener('click', () => {
    const nsec = $('input-nsec').value.trim();
    if (importAccount(nsec)) {
      $('screen-login').classList.remove('active');
      showScreen('feed');
      connectToRelays();
    }
  });

  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const screen = btn.dataset.screen;
      showScreen(screen);

      if (screen === 'profile') loadProfile();
      if (screen === 'messages') await showDmList();
    });
  });

  // Compose
  $('btn-back-compose').addEventListener('click', () => showScreen('feed'));

  $('compose-text').addEventListener('input', (e) => {
    $('compose-count').textContent = `${e.target.value.length}/10000`;
  });

  $('btn-publish').addEventListener('click', () => {
    publishNote($('compose-text').value);
    $('compose-text').value = '';
    showScreen('feed');
  });

  // Reply
  $('btn-back-reply').addEventListener('click', () => showScreen('feed'));

  $('reply-text').addEventListener('input', (e) => {
    $('reply-count').textContent = `${e.target.value.length}/10000`;
  });

  $('btn-reply-send').addEventListener('click', () => {
    sendReply($('reply-text').value);
  });

  // DMs
  $('btn-back-messages').addEventListener('click', async () => showDmList());

  $('btn-new-dm')?.addEventListener('click', () => {
    $('modal-new-dm').classList.remove('hidden');
  });

  $('btn-cancel-dm').addEventListener('click', () => {
    $('modal-new-dm').classList.add('hidden');
  });

  $('btn-send-dm').addEventListener('click', async () => {
    const recipient = $('dm-recipient').value.trim();
    const message = $('dm-message').value.trim();
    if (recipient && message) {
      $('modal-new-dm').classList.add('hidden');
      await openDm(recipient);
      await sendDm(message);
    }
  });

  $('btn-dm-send').addEventListener('click', () => sendDm($('dm-input').value));

  $('dm-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendDm($('dm-input').value);
  });

  // Profile
  $('btn-back-profile')?.addEventListener('click', () => showScreen('feed'));

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
      const text = input.value;

      // Método 1: Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Copiado al portapapeles', 'success');
        }).catch(() => {
          fallbackCopy(text, btn);
        });
      } else {
        fallbackCopy(text, btn);
      }
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
    showScreen('login');
    showToast('Sesión cerrada');
  });

  // Settings
  $('btn-back-settings')?.addEventListener('click', () => showScreen('feed'));

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

  // Search by npub
  $('btn-search-user').addEventListener('click', () => {
    const input = $('search-npub').value.trim();
    if (!input) return;

    let hexPubkey;
    try {
      hexPubkey = decodeBech32(input);
    } catch (e) {
      showToast('npub inválido', 'error');
      return;
    }

    closeSideMenu();
    searchUserProfile(hexPubkey);
  });

  $('search-npub').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') $('btn-search-user').click();
  });

  // User profile back button
  $('btn-back-user-profile')?.addEventListener('click', () => showScreen('feed'));

  // Send DM from user profile
  $('btn-send-dm-to-user')?.addEventListener('click', async () => {
    if (!state.viewingUserProfile) return;
    showScreen('messages');
    await openDm(state.viewingUserProfile);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    init();
  } catch (e) {
    console.error('NostraIsla: Error al inicializar:', e);
    document.body.innerHTML = `
      <div style="padding:20px;color:#fff;background:#1a1a2e;height:100vh;font-family:monospace">
        <h2>Error al cargar NostraIsla</h2>
        <p>${e.message}</p>
        <p style="color:#888">Revisa la consola del navegador (F12) para más detalles.</p>
      </div>
    `;
  }
});
