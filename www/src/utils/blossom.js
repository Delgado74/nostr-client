import { sha256 } from 'https://esm.sh/@noble/hashes/sha2.js';
import { bytesToHex } from 'https://esm.sh/@noble/hashes/utils.js';

async function sha256Hex(data) {
  const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  return bytesToHex(sha256(new Uint8Array(buffer)));
}

function getNativeHttp() {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Http) {
      return window.Capacitor.Plugins.Http;
    }
  } catch (e) {}
  return null;
}

async function nativeUpload(url, formData) {
  const http = getNativeHttp();
  console.log('Native HTTP available:', !!http);
  if (!http) throw new Error('No native HTTP');

  const response = await http.request({
    method: 'POST',
    url,
    data: formData,
    headers: {}
  });

  console.log('Native response:', response.status, typeof response.data);
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = typeof response.data === 'string' ? response.data :
    (response.data && response.data.data ? response.data.data : JSON.stringify(response.data));
  return text.trim();
}

async function fetchUpload(url, formData) {
  const response = await fetch(url, { method: 'POST', body: formData });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.text()).trim();
}

async function uploadWithFallback(file) {
  const http = getNativeHttp();
  const mode = http ? 'native' : 'fetch';
  console.log(`Upload mode: ${mode}, Capacitor: ${!!window.Capacitor}`);

  const services = [
    {
      name: 'Catbox',
      url: 'https://catbox.moe/user/api.php',
      buildForm: (f) => {
        const fd = new FormData();
        fd.append('reqtype', 'fileupload');
        fd.append('fileToUpload', f);
        return fd;
      }
    },
    {
      name: 'Litterbox',
      url: 'https://litterbox.catbox.moe/resources/internals/api.php',
      buildForm: (f) => {
        const fd = new FormData();
        fd.append('reqtype', 'fileupload');
        fd.append('time', '72h');
        fd.append('fileToUpload', f);
        return fd;
      }
    },
    {
      name: '0x0.st',
      url: 'https://0x0.st',
      buildForm: (f) => {
        const fd = new FormData();
        fd.append('file', f);
        return fd;
      }
    }
  ];

  for (const service of services) {
    try {
      const formData = service.buildForm(file);
      console.log(`Intentando ${service.name} (${mode})...`);

      let result;
      if (http) {
        result = await nativeUpload(service.url, formData);
      } else {
        result = await fetchUpload(service.url, formData);
      }

      if (!result.startsWith('https://')) {
        throw new Error(`Respuesta inválida: ${result}`);
      }

      console.log(`${service.name}: OK -> ${result}`);
      return result;
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
