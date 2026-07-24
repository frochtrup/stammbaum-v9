// services/file/picker-adapter.ts — Import "Bytes rein" (Spec 14 §2): universal über
// <input type="file">. Plattform-API bewusst NUR hier hinter PickerAdapter.
//
// Nutzt ein verstecktes <input type="file">-Element statt der (nur auf wenigen
// Plattformen verfügbaren) showOpenFilePicker()-API, weil pickAndImport() gemäß Spec
// 14 §2 "überall identisch" sein soll. Das FS-Access-Handle (Tier 1 für spätere Saves)
// wird nur zusätzlich erworben, wenn showOpenFilePicker() existiert.
//
// BYTES, nicht Text (BL-139): GRAMPS ist gzip-komprimiertes XML — als `file.text()`
// gelesen wäre es Datenmüll. Der Picker liest daher die Rohbytes, entpackt bei gzip-Magic
// über den injizierten `GzipCodec` und erkennt das Format am entpackten Text. GEDCOM bleibt
// Text; das Ergebnis trägt das erkannte `format`.

import type { PickedFile, PickerAdapter } from './types';
import type { GzipCodec } from './gzip-codec';
import { detectDocFormat, isGzip } from './doc-format';

interface FsFileHandleLike {
  getFile(): Promise<File>;
}

export class InputFilePickerAdapter implements PickerAdapter {
  /**
   * `gzip` wird NUR zum Entpacken (`gunzip`) einer gewählten GRAMPS-Datei gebraucht. Optional,
   * weil derselbe Adapter auch für den orte.json-Import wiederverwendet wird (ADR-v9-70) —
   * dort ist die Datei immer unkomprimiertes JSON, nie gzip.
   */
  constructor(private readonly gzip?: GzipCodec) {}

  async pick(): Promise<PickedFile | null> {
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      return this.pickViaFsAccess();
    }
    return this.pickViaInput();
  }

  private async readPicked(file: File, handle?: unknown): Promise<PickedFile> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text: string;
    if (isGzip(bytes)) {
      if (!this.gzip) throw new Error('InputFilePickerAdapter: gzip-Datei gewählt, aber kein GzipCodec injiziert');
      text = await this.gzip.gunzip(bytes);
    } else {
      text = new TextDecoder().decode(bytes);
    }
    return { text, name: file.name, format: detectDocFormat(text), handle };
  }

  private async pickViaFsAccess(): Promise<PickedFile | null> {
    try {
      const w = window as unknown as {
        showOpenFilePicker(): Promise<FsFileHandleLike[]>;
      };
      const [handle] = await w.showOpenFilePicker();
      if (!handle) return null;
      return this.readPicked(await handle.getFile(), handle);
    } catch {
      return null; // Nutzerabbruch
    }
  }

  private pickViaInput(): Promise<PickedFile | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '*/*';
      input.style.display = 'none';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
          resolve(null);
          return;
        }
        this.readPicked(file).then(resolve);
      });
      document.body.appendChild(input);
      input.click();
    });
  }
}
