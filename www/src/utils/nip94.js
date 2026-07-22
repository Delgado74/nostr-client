import { createEvent } from './event.js';

export function createMediaEvent(privateKey, fileInfo, message = '') {
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

export function parseMediaEvent(event) {
  if (event.kind !== 1063) return null;

  const url = event.tags.find(t => t[0] === 'url')?.[1];
  const sha256 = event.tags.find(t => t[0] === 'x')?.[1];
  const size = event.tags.find(t => t[0] === 'size')?.[1];
  const mime = event.tags.find(t => t[0] === 'm')?.[1];
  const filename = event.tags.find(t => t[0] === 'filename')?.[1];

  return { url, sha256, size, mime, filename, content: event.content };
}
