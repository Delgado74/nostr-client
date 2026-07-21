const { bytesToHex, hexToBytes } = require('@noble/hashes/utils');
const { sha256 } = require('@noble/hashes/sha256');
const secp256k1 = require('@noble/secp256k1');

function generatePrivateKey() {
  return bytesToHex(secp256k1.utils.randomPrivateKey());
}

function getPublicKey(privateKey) {
  return bytesToHex(secp256k1.getPublicKey(privateKey, true));
}

function encodeBech32(prefix, data) {
  return `${prefix}${data}`;
}

function getNpub(publicKey) {
  return encodeBech32('npub', publicKey);
}

function getNsec(privateKey) {
  return encodeBech32('nsec', privateKey);
}

function signEvent(event, privateKey) {
  const eventHash = sha256(new TextEncoder().encode(JSON.stringify(event)));
  const signature = secp256k1.sign(eventHash, privateKey);
  return bytesToHex(signature.toCompactRawBytes());
}

function verifySignature(event, publicKey) {
  const eventHash = sha256(new TextEncoder().encode(JSON.stringify(event)));
  return secp256k1.verify(event.signature, eventHash, publicKey);
}

module.exports = {
  generatePrivateKey,
  getPublicKey,
  getNpub,
  getNsec,
  signEvent,
  verifySignature
};
