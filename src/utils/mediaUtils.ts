import { convertFileSrc } from '@tauri-apps/api/core';

export function safeConvertFileSrc(filePath?: string | null): string {
  if (!filePath || typeof filePath !== 'string') return '';
  let clean = filePath.trim().replace(/\\/g, '/');
  // Strip Windows verbatim path prefix \\?\ if present
  if (clean.startsWith('//?/')) {
    clean = clean.slice(4);
  }
  return convertFileSrc(clean);
}
