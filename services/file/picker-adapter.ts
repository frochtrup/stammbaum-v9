// services/file/picker-adapter.ts — Import "Bytes rein" (Spec 14 §2): universal über
// <input type="file">. Plattform-API bewusst NUR hier hinter PickerAdapter.
//
// Nutzt ein verstecktes <input type="file">-Element statt der (nur auf wenigen
// Plattformen verfügbaren) showOpenFilePicker()-API, weil pickAndImport() gemäß Spec
// 14 §2 "überall identisch" sein soll. Das FS-Access-Handle (Tier 1 für spätere Saves)
// wird nur zusätzlich erworben, wenn showOpenFilePicker() existiert.

import type { PickedFile, PickerAdapter } from './types';

interface FsFileHandleLike {
  getFile(): Promise<File>;
}

async function readAsText(file: File): Promise<string> {
  return file.text();
}

export class InputFilePickerAdapter implements PickerAdapter {
  async pick(): Promise<PickedFile | null> {
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      return this.pickViaFsAccess();
    }
    return this.pickViaInput();
  }

  private async pickViaFsAccess(): Promise<PickedFile | null> {
    try {
      const w = window as unknown as {
        showOpenFilePicker(): Promise<FsFileHandleLike[]>;
      };
      const [handle] = await w.showOpenFilePicker();
      if (!handle) return null;
      const file = await handle.getFile();
      return { text: await readAsText(file), name: file.name, handle };
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
        readAsText(file).then((text) => resolve({ text, name: file.name }));
      });
      document.body.appendChild(input);
      input.click();
    });
  }
}
