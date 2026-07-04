// services/file/blob-part.ts — kleine geteilte Normalisierung für Blob-Konstruktion.
// TypeScripts DOM-Lib verlangt für BlobPart einen Uint8Array<ArrayBuffer> (nicht die
// generischere ArrayBufferLike-Variante, die Uint8Array laut lib.dom sonst hätte);
// eine einzige, zentrale Stelle statt eines Casts pro Adapter (INV-FILE-2-Geist:
// ein Weg, nicht mehrere Streuselstellen).

export function toBlobPart(bytes: Uint8Array | string): BlobPart {
  if (typeof bytes === 'string') return bytes;
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}
