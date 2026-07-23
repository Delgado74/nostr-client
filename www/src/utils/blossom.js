import { sha256 } from 'https://esm.sh/@noble/hashes/sha2.js';
import { bytesToHex } from 'https://esm.sh/@noble/hashes/utils.js';
import { createEvent } from './event.js';

async function sha256Hex(data) {
  const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  return bytesToHex(sha256(new Uint8Array(buffer)));
}

function createMediaEvent(privateKey, fileInfo, message = '') {
  const tags = [
    ['url', fileInfo.url],
    ['x', fileInfo.sha256],
    ['size', String(fileInfo.size)],
    ['m', fileInfo.type],
    ['blurhash', '']
  ];

  if (fileInfo.name) {
    tags.push(['filename', fileInfo.name]);
  }

  return createEvent(privateKey, 1063, message, tags);
}

async function uploadToCatbox(file) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', file);

  console.log(`Catbox: uploading ${file.name} (${file.size} bytes)`);

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData
  });

  console.log(`Catbox: responded ${response.status}`);

  if (!response.ok) {
    throw new Error(`Catbox: ${response.status} ${response.statusText}`);
  }

  const url = (await response.text()).trim();

  if (!url.startsWith('https://')) {
    throw new Error(`Catbox: respuesta inválida: ${url}`);
  }

  console.log('Catbox: upload OK', url);
  return url;
}

export async function uploadMedia(file, privateKey) {
  if (!privateKey) throw new Error('Se requiere clave privada');

  const hash = await sha256Hex(await file.arrayBuffer());

  let url;
  try {
    url = await uploadToCatbox(file);
  } catch (e) {
    console.error('Catbox upload failed:', e);
    throw new Error(`No se pudo subir: ${e.message}`);
  }

  return {
    url,
    sha256: hash,
    size: file.size,
    type: file.type,
    name: file.name
  };
}

export { createMediaEvent };
