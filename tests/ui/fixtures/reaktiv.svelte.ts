// tests/ui/fixtures/reaktiv.svelte.ts — macht aus einem gewöhnlichen Objekt einen ECHTEN
// tief-reaktiven Svelte-Proxy, so wie ihn ein Formular hält.
//
// Warum eine eigene `.svelte.ts`-Datei: Runen laufen nur durch den Svelte-Compiler, und
// der greift bei Modulen ausschließlich auf `*.svelte.ts` — eine `*.test.ts` erreicht er
// nicht. Der Umweg ist nötig, weil ein handgebauter `new Proxy(...)` die Sache nur ÄHNLICH
// nachstellt: `$state.snapshot` behandelt Svelte-Proxys über einen eigenen Pfad, und ein
// Test, der die Nachbildung prüft, prüft nicht das Verhalten der echten Sache
// (dieselbe Lehre wie beim selbstgebauten Slugger, ADR-v9-105).
export function reaktiv<T>(wert: T): T {
  const proxy = $state(wert);
  return proxy;
}
