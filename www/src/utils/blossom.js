import { sha256 } from 'https://esm.sh/@noble/hashes/sha2.js';
import { bytesToHex } from 'https://esm.sh/@noble/hashes/utils.js';

async function sha256Hex(data) {
  const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  return bytesToHex(sha256(new Uint8Array(buffer)));
}

async function uploadToCatbox(file) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', file);

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    headers: {
      'User-Agent': 'NostraIsla/1.0'
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Catbox: ${response.status}`);
  }

  const url = (await response.text()).trim();
  if (!url.startsWith('https://')) {
    throw new Error(`Catbox: respuesta inválida: ${url}`);
  }
  return url;
}

async function uploadToLitterbox(file) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '72h');
  formData.append('fileToUpload', file);

  const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    headers: {
      'User-Agent': 'NostraIsla/1.0'
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Litterbox: ${response.status}`);
  }

  const url = (await response.text()).trim();
  if (!url.startsWith('https://')) {
    throw new Error(`Litterbox: respuesta inválida: ${url}`);
  }
  return url;
}

async function uploadTo0x0(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('https://0x0.st', {
    method: 'POST',
    headers: {
      'User-Agent': 'NostraIsla/1.0'
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`0x0.st: ${response.status}`);
  }

  const url = (await response.text()).trim();
  if (!url.startsWith('https://')) {
    throw new Error(`0x0.st: respuesta inválida: ${url}`);
  }
  return url;
}

async function uploadWithFallback(file) {
  const services = [
    { name: 'Catbox', fn: uploadToCatbox },
    { name: 'Litterbox', fn: uploadToLitterbox },
    { name: '0x0.st', fn: uploadTo0x0 }
  ];

  for (const service of services) {
    try {
      console.log(`Intentando subir con ${service.name}...`);
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
