export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function uint8ToPngDataUrlSync(u8Arr: Uint8Array): string {
  const CHUNK = 0x8000; // 32 KB
  let binary = '';
  for (let i = 0; i < u8Arr.length; i += CHUNK) {
    const slice = u8Arr.subarray(i, Math.min(i + CHUNK, u8Arr.length));
    binary += String.fromCharCode(...slice);
  }
  return window.btoa(binary); // if you need the full data-URL, prepend 'data:image/png;base64,'
}
