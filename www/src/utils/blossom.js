import { sha256 } from 'https://esm.sh/@noble/hashes/sha2.js';
import { bytesToHex } from 'https://esm.sh/@noble/hashes/utils.js';
import { createEvent } from './event.js';

const DEFAULT_BLOSSOM_SERVERS = [
  'https://blossom.nostr.build',
  'https://cdn.blossom.cloud',
  'https://blossom.relays.pub'
];

async function sha256Hex(data) {
  const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  return bytesToHex(sha256(new Uint8Array(buffer)));
}

function bytesToBase64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createAuthEvent(privateKey, hash, serverDomain) {
  const expiration = Math.floor(Date.now() / 1000) + 600;
  const tags = [
    ['t', 'upload'],
    ['x', hash],
    ['expiration', String(expiration)],
    ['server', serverDomain]
  ];
  return createEvent(privateKey, 24242, 'Upload Blob', tags);
}

function encodeAuthHeader(authEvent) {
  const json = JSON.stringify(authEvent);
  const encoded = bytesToBase64url(new TextEncoder().encode(json));
  return `Nostr ${encoded}`;
}

function isNative() {
  return !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Http);
}

async function httpPut(url, headers, body) {
  if (isNative()) {
    console.log('Blossom: using CapacitorHttp (native)');
    const result = await window.Capacitor.Plugins.Http.request({
      method: 'PUT',
      url,
      headers,
      data: body
    });
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      statusText: '',
      headers: { get: (name) => result.headers[name] || null },
      json: () => Promise.resolve(result.data)
    };
  }

  console.log('Blossom: using fetch');
  return fetch(url, {
    method: 'PUT',
    headers,
    body
  });
}

export async function uploadToBlossom(file, serverUrl, privateKey) {
  if (!privateKey) throw new Error('Se requiere clave privada para subir a Blossom');

  const servers = serverUrl ? [serverUrl] : DEFAULT_BLOSSOM_SERVERS;
  const fileBytes = await file.arrayBuffer();
  const hash = await sha256Hex(fileBytes);
  const ext = file.name.split('.').pop() || '';

  const errors = [];
  for (const server of servers) {
    try {
      const uploadUrl = `${server}/upload`;
      const serverDomain = new URL(server).hostname;
      const authEvent = createAuthEvent(privateKey, hash, serverDomain);
      const authHeader = encodeAuthHeader(authEvent);

      console.log(`Blossom: uploading to ${uploadUrl} (${file.size} bytes, native=${isNative()})`);

      const headers = {
        'Content-Type': file.type || 'application/octet-stream',
        'X-SHA-256': hash,
        'Authorization': authHeader
      };

      let response;
      if (isNative()) {
        response = await httpPut(uploadUrl, headers, fileBytes);
      } else {
        const blob = new Blob([fileBytes], { type: file.type || 'application/octet-stream' });
        response = await httpPut(uploadUrl, headers, blob);
      }

      console.log(`Blossom: ${server} responded ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log('Blossom: upload OK', result);
        return {
          url: result.url || `${server}/${hash}${ext ? '.' + ext : ''}`,
          sha256: result.sha256 || hash,
          size: result.size || file.size,
          type: result.type || file.type,
          name: file.name,
          server
        };
      }

      const reason = response.headers.get('x-reason') || response.statusText;
      errors.push(`${server}: ${response.status} ${reason}`);
      console.log(`Blossom: rejected - ${reason}`);
    } catch (e) {
      errors.push(`${server}: ${e.message}`);
      console.log(`Blossom: error - ${e.message}`);
    }
  }

  throw new Error(`Upload falló: ${errors.join(' | ')}`);
}

export function getBlossomServers() {
  return [...DEFAULT_BLOSSOM_SERVERS];
}
