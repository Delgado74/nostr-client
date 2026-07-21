import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import * as secp256k1 from '@noble/secp256k1';

const h256 = (k, m) => hmac(sha256, k, m);
secp256k1.hashes.sha256 = sha256;
secp256k1.hashes.hmacSha256 = h256;

export function generatePrivateKey() {
  return bytesToHex(secp256k1.utils.randomSecretKey());
}

export function getPublicKey(privateKey) {
  return bytesToHex(secp256k1.schnorr.getPublicKey(hexToBytes(privateKey)));
}

export function getNpub(publicKey) {
  return `npub${publicKey}`;
}

export function getNsec(privateKey) {
  return `nsec${privateKey}`;
}
