import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from './crypto.js';
import * as secp256k1 from '@noble/secp256k1';

function serializeEvent(event) {
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);
}

function hashEvent(event) {
  return bytesToHex(sha256(new TextEncoder().encode(serializeEvent(event))));
}

function sign(privateKey, event) {
  const eventHash = sha256(new TextEncoder().encode(serializeEvent(event)));
  const sig = secp256k1.schnorr.sign(eventHash, hexToBytes(privateKey));
  return bytesToHex(sig);
}

export function createEvent(privateKey, kind, content, tags = []) {
  const publicKey = getPublicKey(privateKey);

  const event = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags,
    pubkey: publicKey
  };

  event.id = hashEvent(event);
  event.sig = sign(privateKey, event);

  return event;
}

export function createNote(privateKey, content) {
  return createEvent(privateKey, 1, content);
}

export function createReply(privateKey, content, targetEvent) {
  const tags = [
    ['e', targetEvent.id, '', 'root'],
    ['p', targetEvent.pubkey]
  ];

  if (targetEvent.tags) {
    const rootTag = targetEvent.tags.find(t => t[3] === 'root');
    if (rootTag) {
      tags[0] = ['e', rootTag[1], '', 'root'];
    }
  }

  return createEvent(privateKey, 1, content, tags);
}

export function createQuote(privateKey, content, targetEvent) {
  const tags = [
    ['e', targetEvent.id],
    ['p', targetEvent.pubkey]
  ];
  return createEvent(privateKey, 1, content, tags);
}

export function createProfile(privateKey, profileData) {
  return createEvent(privateKey, 0, JSON.stringify(profileData));
}

export function createContactList(privateKey, contacts) {
  const tags = contacts.map(c => ['p', c.pubkey, c.relay || '', c.name || '']);
  return createEvent(privateKey, 3, '', tags);
}

export function createReaction(privateKey, reaction, targetEvent) {
  const tags = [
    ['e', targetEvent.id],
    ['p', targetEvent.pubkey]
  ];
  return createEvent(privateKey, 7, reaction, tags);
}

export function createRepost(privateKey, targetEvent) {
  const tags = [
    ['e', targetEvent.id],
    ['p', targetEvent.pubkey]
  ];
  return createEvent(privateKey, 6, '', tags);
}
