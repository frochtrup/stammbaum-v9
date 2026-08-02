// services/file/share-adapter.ts — Tier 2a (Spec 14 §4): navigator.share({files}).
// iOS/Safari u. a. Plattform-API bewusst NUR hier hinter ShareAdapter.

import type { ShareAdapter } from './types';
import { toBlobPart } from './blob-part';

function toFile(bytes: Uint8Array | string, filename: string, mimeType: string): File {
  return new File([toBlobPart(bytes)], filename, { type: mimeType });
}

export class NavigatorShareAdapter implements ShareAdapter {
  /**
   * „Ist das Share-Sheet hier ein tauglicher SPEICHERWEG?" — nicht „existiert die API?"
   * (Spec 14 §4, ADR-v9-194). Der Unterschied ist kein Detail: auf macOS meldet
   * `canShare({files})` `true`, aber das dortige Sheet bietet — anders als das auf iOS —
   * kein „In Dateien sichern". Wer es dort anbietet, führt den Nutzer in eine Sackgasse.
   *
   * Unterschieden wird deshalb über die TOUCH-Fähigkeit, nicht über den User-Agent:
   * `maxTouchPoints` ist 0 auf macOS/Windows-Desktop und ≥1 auf iOS/iPadOS/Android —
   * genau die Plattformen, deren Sheet ein Dateiziel anbietet. iPadOS lässt sich vom Mac
   * per UA gar nicht mehr unterscheiden (beide melden „MacIntel"), über diese Eigenschaft
   * schon. Auf dem Desktop übernimmt Tier 1b/2b (Dialog bzw. Download).
   */
  isSupported(): boolean {
    if (typeof navigator === 'undefined' || !('share' in navigator)) return false;
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
    if (!(nav.maxTouchPoints > 0)) return false;
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
