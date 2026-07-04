// services/file/download-adapter.ts — Tier 2b (Spec 14 §4): <a download>-Fallback
// (Firefox u. a. ohne navigator.share). Plattform-API bewusst NUR hier.

import type { DownloadAdapter } from './types';
import { toBlobPart } from './blob-part';

export class AnchorDownloadAdapter implements DownloadAdapter {
  download(bytes: Uint8Array | string, filename: string, mimeType: string): void {
    const blob = new Blob([toBlobPart(bytes)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
