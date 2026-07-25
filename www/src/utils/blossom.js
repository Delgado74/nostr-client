import { sha256 } from 'https://esm.sh/@noble/hashes/sha2.js';
import { bytesToHex } from 'https://esm.sh/@noble/hashes/utils.js';

async function sha256Hex(data) {
  const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  return bytesToHex(sha256(new Uint8Array(buffer)));
}

function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

function nativeHttpPost(url, formData) {
  const { Http } = window.Capacitor.Plugins;
  return Http.request({
    method: 'POST',
    url,
    data: formData,
    headers: {
      'User-Agent': 'NostraIsla/1.0'
    }
  });
}

async function uploadToCatboxNative(file) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', file);

  console.log('Catbox (native): uploading', file.name);
  const response = await nativeHttpPost('https://catbox.moe/user/api.php', formData);
  console.log('Catbox (native): response', response.status, response.data);

  if (response.status >= 400) {
    throw new Error(`Catbox: ${response.status}`);
  }

  const url = (typeof response.data === 'string' ? response.data : '').trim();
  if (!url.startsWith('https://')) {
    throw new Error(`Catbox: respuesta inválida: ${url}`);
  }
  return url;
}

async function uploadToLitterboxNative(file) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '72h');
  formData.append('fileToUpload', file);

  console.log('Litterbox (native): uploading', file.name);
  const response = await nativeHttpPost('https://litterbox.catbox.moe/resources/internals/api.php', formData);
  console.log('Litterbox (native): response', response.status, response.data);

  if (response.status >= 400) {
    throw new Error(`Litterbox: ${response.status}`);
  }

  const url = (typeof response.data === 'string' ? response.data : '').trim();
  if (!url.startsWith('https://')) {
    throw new Error(`Litterbox: respuesta inválida: ${url}`);
  }
  return url;
}

async function uploadTo0x0Native(file) {
  const formData = new FormData();
  formData.append('file', file);

  console.log('0x0.st (native): uploading', file.name);
  const response = await nativeHttpPost('https://0x0.st', formData);
  console.log('0x0.st (native): response', response.status, response.data);

  if (response.status >= 400) {
    throw new Error(`0x0.st: ${response.status}`);
  }

  const url = (typeof response.data === 'string' ? response.data : '').trim();
  if (!url.startsWith('https://')) {
    throw new Error(`0x0.st: respuesta inválida: ${url}`);
  }
  return url;
}

async function uploadToCatboxFetch(file) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', file);

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) throw new Error(`Catbox: ${response.status}`);
  const url = (await response.text()).trim();
  if (!url.startsWith('https://')) throw new Error(`Catbox: inválido: ${url}`);
  return url;
}

async function uploadToLitterboxFetch(file) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '72h');
  formData.append('fileToUpload', file);

  const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) throw new Error(`Litterbox: ${response.status}`);
  const url = (await response.text()).trim();
  if (!url.startsWith('https://')) throw new Error(`Litterbox: inválido: ${url}`);
  return url;
}

async function uploadTo0x0Fetch(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('https://0x0.st', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) throw new Error(`0x0.st: ${response.status}`);
  const url = (await response.text()).trim();
  if (!url.startsWith('https://')) throw new Error(`0x0.st: inválido: ${url}`);
  return url;
}

async function uploadWithFallback(file) {
  const isNative = isNativeApp();

  const services = isNative ? [
    { name: 'Catbox', fn: uploadToCatboxNative },
    { name: 'Litterbox', fn: uploadToLitterboxNative },
    { name: '0x0.st', fn: uploadTo0x0Native }
  ] : [
    { name: 'Catbox', fn: uploadToCatboxFetch },
    { name: 'Litterbox', fn: uploadToLitterboxFetch },
    { name: '0x0.st', fn: uploadTo0x0Fetch }
  ];

  for (const service of services) {
    try {
      console.log(`Intentando subir con ${service.name} (${isNative ? 'native' : 'fetch'})...`);
      const url = await service.fn(file);
      console.log(`${service.name}: OK -> ${url}`);
      return url;
    } catch (e) {
      console.warn(`${service.name} falló: ${e.message}`);
    }
  }

  throw new Error('Todos los servicios de upload fallaron');
}

export async function uploadMedia(file, privateKey) {
  if (!privateKey) throw new Error('Se requiere clave privada');

  const hash = await sha256Hex(await file.arrayBuffer());
  const url = await uploadWithFallback(file);

  return {
    url,
    sha256: hash,
    size: file.size,
    type: file.type,
    name: file.name
  };
}
