import * as bech32 from 'https://esm.sh/bech32@1.1.4';

export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function encodeNpub(hexPubkey) {
  const bytes = hexToBytes(hexPubkey);
  const words = bech32.toWords(bytes);
  return bech32.encode('npub', words, 90);
}

export function encodeNsec(hexPrivkey) {
  const bytes = hexToBytes(hexPrivkey);
  const words = bech32.toWords(bytes);
  return bech32.encode('nsec', words, 90);
}

export function decodeBech32(bech32Str) {
  const prefix = bech32Str.startsWith('npub') ? 'npub' : 'nsec';
  const decoded = bech32.decode(bech32Str, 90);
  const bytes = bech32.fromWords(decoded.words);
  return bytesToHex(new Uint8Array(bytes));
}
