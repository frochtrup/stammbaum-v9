// services/file/gzip-codec.ts — die gzip-Hülle für GRAMPS (Plattform-Seam, Spec 14 §3.2).
//
// GRAMPS ist gzip-komprimiertes XML; der Kern (core/interop) behandelt bewusst nur den
// XML-TEXT (headless testbar). Kompression/Dekompression leben hier hinter einem Adapter
// (wie alle Plattform-APIs in services/, INV-ARCH-1 gilt für core/, nicht hier). Der
// Export-Pipe nimmt `GzipAdapter.gzip`; der Import braucht `gunzip`.

/** Text ⇄ gzip-Bytes. Injizierbar, damit die Orchestrierung headless mockbar bleibt. */
export interface GzipCodec {
  gzip(text: string): Promise<Uint8Array>;
  gunzip(bytes: Uint8Array): Promise<string>;
}

async function streamThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  // Die DOM-lib typisiert writable als WritableStream<BufferSource> und readable als
  // ReadableStream<Uint8Array> — hier bewusst als Uint8Array-Ströme behandelt (wir schreiben
  // Uint8Array rein und lesen Uint8Array raus).
  const writer = (stream.writable as WritableStream<Uint8Array>).getWriter();
  void writer.write(bytes);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = (stream.readable as ReadableStream<Uint8Array>).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/**
 * Reale gzip-Codec über die Web-Streams-API (`CompressionStream`/`DecompressionStream`,
 * verfügbar in aktuellen Browsern + modernem Node). Kein Fremd-Paket nötig.
 */
export class CompressionStreamGzipCodec implements GzipCodec {
  async gzip(text: string): Promise<Uint8Array> {
    const input = new TextEncoder().encode(text);
    return streamThrough(input, new CompressionStream('gzip'));
  }

  async gunzip(bytes: Uint8Array): Promise<string> {
    const out = await streamThrough(bytes, new DecompressionStream('gzip'));
    return new TextDecoder().decode(out);
  }
}
