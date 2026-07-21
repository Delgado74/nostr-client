import { getSharedSecret } from './crypto.js';

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function getSharedX(privateKeyHex, theirPublicKeyHex) {
  const privBytes = hexToBytes(privateKeyHex);
  const pubBytes = hexToBytes('02' + theirPublicKeyHex);
  const sharedPoint = getSharedSecret(privBytes, pubBytes);
  return sharedPoint.slice(1, 33);
}

export async function encrypt(plaintext, senderPrivKey, receiverPubKey) {
  const sharedX = getSharedX(senderPrivKey, receiverPubKey);
  const iv = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    'raw',
    sharedX,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  );

  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    encoded
  );

  return bytesToBase64(new Uint8Array(ciphertext)) + '?iv=' + bytesToBase64(iv);
}

export async function decrypt(encryptedContent, receiverPrivKey, senderPubKey) {
  const [ciphertextB64, ivParam] = encryptedContent.split('?iv=');
  if (!ciphertextB64 || !ivParam) throw new Error('Formato NIP-04 inválido');

  const sharedX = getSharedX(receiverPrivKey, senderPubKey);
  const iv = base64ToBytes(ivParam);
  const ciphertext = base64ToBytes(ciphertextB64);

  const key = await crypto.subtle.importKey(
    'raw',
    sharedX,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
