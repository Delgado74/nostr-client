import Relay from '../relay/connection.js';
import { generatePrivateKey, getPublicKey, getNpub, getNsec } from '../utils/crypto.js';
import {
  createNote, createReply, createProfile,
  createContactList, createReaction, createRepost
} from '../utils/event.js';
import { ProfileCache, EventCache } from '../utils/cache.js';

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol'
];

const profileCache = new ProfileCache();
const eventCache = new EventCache();
const notifications = [];

function parseProfile(content) {
  try {
    return JSON.parse(content);
  } catch {
    return { name: 'Desconocido', about: '' };
  }
}

function formatTime(timestamp) {
  return new Date(timestamp * 1000).toLocaleTimeString('es');
}

async function main() {
  console.log('=== Nostr Client - Clase 2 ===\n');

  const privateKey = generatePrivateKey();
  const publicKey = getPublicKey(privateKey);
  const npub = getNpub(publicKey);
  const nsec = getNsec(privateKey);

  console.log('Identidad:');
  console.log(`  npub: ${npub}`);
  console.log(`  nsec: ${nsec}\n`);

  const relayConnections = [];
  for (const url of RELAYS) {
    try {
      const relay = new Relay(url);
      await relay.connect();
      relayConnections.push(relay);
    } catch {
      console.log(`No se pudo conectar a ${url}`);
    }
  }

  if (relayConnections.length === 0) {
    console.log('No hay relays disponibles.');
    return;
  }

  console.log(`\nConectado a ${relayConnections.length} relays\n`);

  const publish = (event) => {
    relayConnections.forEach(r => r.publish(event));
  };

  const profileEvent = createProfile(privateKey, {
    name: 'Mi Cliente Nostr',
    about: 'Cliente construido desde cero - Clase 2',
    picture: '',
    nip05: ''
  });
  publish(profileEvent);
  console.log('[OK] Perfil publicado');

  const noteEvent = createNote(privateKey, 'Primera nota desde mi cliente Nostr completo!');
  publish(noteEvent);
  eventCache.add(noteEvent);
  console.log('[OK] Nota publicada');

  const contacts = [
    { pubkey: 'npub180cvv07tjdrrgpa0j7jnvtm6ydx29uew7zaytzjqq89mnxs5ve7ssdq97c', name: 'Alice' },
    { pubkey: 'npub10elfq4m0e6h2v5t0r983g2n8s0m5v5n0g4d0g4g4g4g4g4g4g4', name: 'Bob' }
  ];
  const contactEvent = createContactList(privateKey, contacts);
  publish(contactEvent);
  console.log('[OK] Lista de contactos publicada');

  console.log('\n--- Suscripciones activas ---\n');

  const subId = 'main-feed';
  const filters = [
    { kinds: [1], limit: 5 },
    { kinds: [0], limit: 10 },
    { kinds: [7], limit: 20 },
    { kinds: [6], limit: 20 }
  ];

  relayConnections.forEach(r => {
    r.subscribe(subId, filters, (event) => {
      eventCache.add(event);

      switch (event.kind) {
        case 0: {
          const profile = parseProfile(event.content);
          profileCache.set(event.pubkey, profile);
          break;
        }
        case 1: {
          const profile = profileCache.get(event.pubkey);
          const name = profile?.name || event.pubkey.slice(0, 8);
          const time = formatTime(event.created_at);
          const hasReply = event.tags.some(t => t[0] === 'e');

          if (hasReply) {
            console.log(`[REPLY ${time}] ${name}: ${event.content}`);
          } else {
            console.log(`[NOTE ${time}] ${name}: ${event.content}`);
          }
          break;
        }
        case 7: {
          const reaction = event.content || '+';
          const targetId = event.tags.find(t => t[0] === 'e')?.[1] || '?';
          console.log(`[REACTION] ${reaction} on ${targetId.slice(0, 8)}...`);
          break;
        }
        case 6: {
          console.log(`[REPOST] ${event.pubkey.slice(0, 8)}... reposted`);
          break;
        }
      }
    });
  });

  console.log('\n--- Comandos disponibles ---');
  console.log('  1. Publicar nota');
  console.log('  2. Responder a nota');
  console.log('  3. Reaccionar a nota');
  console.log('  4. Repostear nota');
  console.log('  5. Ver feed');
  console.log('  6. Ver perfil');
  console.log('  7. Salir\n');

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  while (true) {
    const cmd = await ask('Comando: ');

    switch (cmd.trim()) {
      case '1': {
        const content = await ask('Nota: ');
        const note = createNote(privateKey, content);
        publish(note);
        eventCache.add(note);
        console.log('[OK] Nota publicada\n');
        break;
      }
      case '2': {
        const id = await ask('ID de nota a responder: ');
        const target = eventCache.get(id);
        if (!target) {
          console.log('[ERROR] Nota no encontrada en caché\n');
          break;
        }
        const content = await ask('Respuesta: ');
        const reply = createReply(privateKey, content, target);
        publish(reply);
        console.log('[OK] Respuesta publicada\n');
        break;
      }
      case '3': {
        const id = await ask('ID de nota a reaccionar: ');
        const target = eventCache.get(id);
        if (!target) {
          console.log('[ERROR] Nota no encontrada en caché\n');
          break;
        }
        const reaction = await ask('Reacción (+, -, ❤, etc): ');
        const event = createReaction(privateKey, reaction, target);
        publish(event);
        console.log('[OK] Reacción publicada\n');
        break;
      }
      case '4': {
        const id = await ask('ID de nota a repostear: ');
        const target = eventCache.get(id);
        if (!target) {
          console.log('[ERROR] Nota no encontrada en caché\n');
          break;
        }
        const event = createRepost(privateKey, target);
        publish(event);
        console.log('[OK] Repost publicado\n');
        break;
      }
      case '5': {
        console.log('\n--- Feed reciente ---');
        const notes = [...eventCache.events.values()]
          .filter(e => e.kind === 1)
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 10);

        notes.forEach(n => {
          const profile = profileCache.get(n.pubkey);
          const name = profile?.name || n.pubkey.slice(0, 8);
          console.log(`[${n.id.slice(0, 8)}] ${name}: ${n.content}`);
        });
        console.log('');
        break;
      }
      case '6': {
        const pubkey = await ask('npub del perfil: ');
        const profile = profileCache.get(pubkey.replace('npub', ''));
        if (profile) {
          console.log(`\nNombre: ${profile.name}`);
          console.log(`Acerca de: ${profile.about}\n`);
        } else {
          console.log('[INFO] Perfil no encontrado en caché\n');
        }
        break;
      }
      case '7': {
        console.log('Cerrando...');
        relayConnections.forEach(r => r.close());
        rl.close();
        process.exit(0);
      }
      default:
        console.log('Comando no válido\n');
    }
  }
}

main();
