// ============================================
// Bech32 Encoding (NIP-19)
// Para generar npub/nsec válidos
// ============================================

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = (chk & 0x1ffffff) << 5 ^ v;
    for (let i = 0; i < 5; i++) {
      chk ^= ((b >> i) & 1) ? GEN[i] : 0;
    }
  }
  return chk;
}

function hrpExpand(hrp) {
  const ret = [];
  for (let i = 0; i < hrp.length; i++) {
    ret.push(hrp.charCodeAt(i) >> 5);
  }
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) {
    ret.push(hrp.charCodeAt(i) & 31);
  }
  return ret;
}

function verifyChecksum(hrp, data) {
  return polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) === 1;
}

function createChecksum(hrp, data) {
  const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymodValue = polymod(values);
  const ret = [];
  for (let i = 0; i < 6; i++) {
    ret.push((polymodValue >> 5 * (5 - i)) & 31);
  }
  return ret;
}

function convertBits(data, fromBits, toBits, pad = true) {
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    if (value < 0 || (value >> fromBits) !== 0) {
      throw new Error('Invalid value');
    }
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
  } else {
    if (bits >= fromBits) {
      throw new Error('Non-zero padding');
    }
    if ((acc << (toBits - bits)) & maxv) {
      throw new Error('Non-zero padding');
    }
  }
  return ret;
}

function encode(hrp, data) {
  const eightBitData = convertBits(data, 8, 5);
  const checksum = createChecksum(hrp, eightBitData);
  const combined = [...eightBitData, ...checksum];
  let ret = hrp + '1';
  for (const d of combined) {
    ret += CHARSET[d];
  }
  return ret;
}

// ============================================
// Funciones públicas
// ============================================

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
  return encode('npub', bytes);
}

export function encodeNsec(hexPrivkey) {
  const bytes = hexToBytes(hexPrivkey);
  return encode('nsec', bytes);
}

// Decodificar npub/nsec a hex (simplificado)
export function decodeBech32(bech32Str) {
  const prefix = bech32Str.startsWith('npub') ? 'npub' : 'nsec';
  const dataPart = bech32Str.slice(prefix.length + 1);
  
  const data = [];
  for (const c of dataPart) {
    const idx = CHARSET.indexOf(c);
    if (idx === -1) throw new Error('Invalid bech32 character');
    data.push(idx);
  }
  
  const fiveBitData = data.slice(0, -6);
  const eightBitData = convertBits(fiveBitData, 5, 8, false);
  
  return bytesToHex(new Uint8Array(eightBitData));
}
