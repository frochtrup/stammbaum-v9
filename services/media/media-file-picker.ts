// services/media/media-file-picker.ts — Mehrfachauswahl von Mediendateien (BL-259).
// Plattform-API bewusst NUR hier, hinter `MediaFilePicker`.
//
// WARUM NICHT DER VORHANDENE `PickerAdapter` (services/file): der liefert `PickedFile`
// mit einem `text`-Feld und erkennt das Dokumentformat — er ist für GEDCOM/GRAMPS gebaut.
// Ein Bild als Text zu dekodieren zerstört es; genau diese Lehre steht im Kopf von
// `picker-adapter.ts` (BL-139, GRAMPS-gzip). Gleiches MUSTER (Plattform hinter Adapter),
// eigener Vertrag: Blobs statt Text, mehrere statt einer Datei.
import type { PickedMedia, MediaFilePicker } from './types';

// Was ein Bild-/Dokument-Picker sinnvoll anbietet. Bewusst eingegrenzt statt „alle
// Dateien": auf iOS bietet der Dialog dann direkt die Fotomediathek an.
const ACCEPT = 'image/*,application/pdf';

export class InputMediaFilePicker implements MediaFilePicker {
  pickMany(): Promise<PickedMedia[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = ACCEPT;
      input.style.display = 'none';

      // `change` feuert nicht, wenn der Nutzer abbricht — dann bliebe das Versprechen
      // für immer offen und der Aufrufer im „busy"-Zustand hängen. `cancel` ist dafür
      // da; wo es fehlt (ältere Safari), räumt das Entfernen beim nächsten Aufruf auf.
      const finish = (files: PickedMedia[]) => {
        input.remove();
        resolve(files);
      };

      input.addEventListener('change', () => {
        const list = [...(input.files ?? [])];
        finish(
          list.map((f) => ({
            // `webkitRelativePath` ist gefüllt, wenn ein ganzes Verzeichnis gewählt wurde
            // (Desktop). iOS/Safari bietet das nicht an — dort bleibt der Basisname, und
            // die Zuordnung läuft über ihn (s. media-bytes-store.ts).
            path: f.webkitRelativePath || f.name,
            blob: f,
          })),
        );
      });
      input.addEventListener('cancel', () => finish([]));

      document.body.appendChild(input);
      input.click();
    });
  }
}
