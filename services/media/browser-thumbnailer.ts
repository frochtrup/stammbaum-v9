// services/media/browser-thumbnailer.ts — Bild verkleinern, die Plattform-Hälfte von
// BL-258 (ADR-v9-187 Punkt 6). Bewusst winzig und ohne Logik: die Entscheidung, WANN
// verkleinert wird, trifft der Resolver.
//
// Warum es das braucht: 126 der 189 Bilddateien des Realbestands sind unkomprimierte
// BMP. Ein Kachelraster, das sie in Originalgröße dekodiert, belegt ein Vielfaches des
// Dateiumfangs im Speicher — `loading="lazy"` verzögert das nur, es verhindert es nicht.

/**
 * Verkleinert auf `maxEdge` (längste Kante), Seitenverhältnis erhalten. Bilder, die
 * ohnehin kleiner sind, werden unverändert zurückgegeben — ein Hochskalieren wäre
 * Qualitätsverlust ohne Nutzen.
 *
 * Wirft bei Formaten, die der Browser nicht dekodieren kann; der Aufrufer fällt dann
 * auf das Original zurück (siehe `resolveThumbnail`).
 */
export async function browserThumbnail(blob: Blob, maxEdge: number, reencode = false): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    // `reencode` für den Einbettungs-Pfad (BL-261): dort geht es nicht nur um die
    // Kantenlänge, sondern um die KODIERUNG. Am Realbestand sind 126 der 189 Bilder BMP —
    // unkomprimiert. Drei davon in einer Story sind gemessen 1,7 MB, obwohl keines über
    // 600 px hat; als JPEG bleibt davon ein Bruchteil. Ohne dieses Flag griffe die
    // Verkleinerung nie, weil die Bilder unter der Kantenschwelle liegen.
    if (longest <= maxEdge && !reencode) return blob;

    const scale = Math.min(1, maxEdge / longest);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, w, h);
    // JPEG statt PNG: bei Fotos um ein Vielfaches kleiner, und eine Kachel-Vorschau
    // braucht keine Transparenz.
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  } finally {
    bitmap.close();
  }
}

/** Ist die Verkleinerung auf dieser Plattform überhaupt möglich? */
export function canMakeThumbnails(): boolean {
  return typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function';
}
