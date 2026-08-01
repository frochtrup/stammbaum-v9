// services/media/blob-data-url.ts — Bytes → `data:`-URI (BL-261). Die eine Stelle, an
// der aus einem Blob eine selbst-enthaltene Quelle wird.
//
// Warum eigen und nicht inline im Resolver: `FileReader` ist eine Plattform-API, und der
// Resolver soll mit einer Attrappe ohne Browser testbar bleiben (TST-3).

/**
 * Liest den Blob vollständig und liefert `data:<mime>;base64,…`.
 *
 * `FileReader` statt `btoa(String.fromCharCode(...bytes))`: letzteres sprengt bei
 * größeren Dateien den Argument-Stack (`Maximum call stack size exceeded` ab wenigen
 * hundert KB) — und Medien sind hier genau die Sorte Datei, die groß ist.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
