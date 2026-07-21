import { sha256 } from 'https://esm.sh/@noble/hashes/sha2.js';
import { bytesToHex as nobleBytesToHex, hexToBytes as nobleHexToBytes } from 'https://esm.sh/@noble/hashes/utils.js';
import { hmac } from 'https://esm.sh/@noble/hashes/hmac.js';
import * as secp256k1 from 'https://esm.sh/@noble/secp256k1';
import { encodeNpub, encodeNsec } from './bech32.js';

const h256 = (k, m) => hmac(sha256, k, m);
secp256k1.hashes.sha256 = sha256;
secp256k1.hashes.hmacSha256 = h256;

export function generatePrivateKey() {
  return nobleBytesToHex(secp256k1.utils.randomSecretKey());
}

export function getPublicKey(privateKey) {
  return nobleBytesToHex(secp256k1.schnorr.getPublicKey(nobleHexToBytes(privateKey)));
}

export function getNpub(publicKey) {
  return encodeNpub(publicKey);
}

export function getNsec(privateKey) {
  return encodeNsec(privateKey);
}

export { nobleBytesToHex as bytesToHex, nobleHexToBytes as hexToBytes };

export function getSharedSecret(privateKey, publicKey) {
  return secp256k1.getSharedSecret(privateKey, publicKey);
}
