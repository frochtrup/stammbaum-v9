// ui/shell/event-line-row.ts — Zeilen-Form für `EventLine.svelte` (ADR-v9-80).
// EIGENE .ts-Datei statt eines benannten Exports aus der .svelte-Komponente selbst:
// plain `tsc` (im Gegensatz zu Svelte's eigenem Compiler/svelte-check) sieht `.svelte`-
// Module nur über die generische Ambient-Deklaration `declare module '*.svelte'`
// (Default-Export only) — ein `export interface` INNERHALB einer .svelte-Datei ist für
// svelte-interne Importe (andere .svelte-Dateien) sichtbar, aber nicht für `tsc`, wenn
// eine PLAIN .ts-Datei (z. B. ein Vitest-Test) den Typ importieren will (TS2614).
// Strukturell kompatibel mit `EventRow` (person-detail-model.ts) UND `FamilyEventRow`
// (family-detail-model.ts), seit beide auf `dateLabel`/`placeLabel` umgestellt sind.
import type { Citation } from '../../core/model/types';
import type { Coords } from '../../core/places';

export interface EventLineRow {
  key: string;
  label: string;
  dateLabel: string;
  placeLabel: string;
  value: string;
  addr: string;
  note: string;
  citations: Citation[];
  coords: Coords | null;
  placeId: string | null;
  hofId: string | null;
  empty: boolean;
}
