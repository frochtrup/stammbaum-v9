// services/file/share-adapter.ts — Tier 2a (Spec 14 §4): navigator.share({files}).
// iOS/Safari u. a. Plattform-API bewusst NUR hier hinter ShareAdapter.

import type { ShareAdapter } from './types';
import { toBlobPart } from './blob-part';

function toFile(bytes: Uint8Array | string, filename: string, mimeType: string): File {
  return new File([toBlobPart(bytes)], filename, { type: mimeType });
}

export class NavigatorShareAdapter implements ShareAdapter {
  isSupported(): boolean {
    if (typeof navigator === 'undefined' || !('share' in navigator)) return false;
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
    // canShare ist optional in älteren Implementierungen; ohne canShare optimistisch annehmen.
    if (!nav.canShare) return true;
    return nav.canShare({ files: [toFile('x', 'x.txt', 'text/plain')] });
  }

  async share(bytes: Uint8Array | string, filename: string, mimeType: string): Promise<boolean> {
    const file = toFile(bytes, filename, mimeType);
    try {
      await (navigator as Navigator & { share: (data: { files: File[] }) => Promise<void> }).share({
        files: [file]
      });
      return true;
    } catch {
      // Nutzerabbruch (AbortError) ist kein Fehler des Dateihandlings.
      return false;
    }
  }
}
