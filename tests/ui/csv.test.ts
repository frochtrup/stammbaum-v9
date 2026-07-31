// tests/ui/csv.test.ts — reine CSV-Serialisierung (BL-125, ADR-v9-159). Dialekt: `;`
// + UTF-8-BOM. Deckt die Fälle ab, an denen CSV üblicherweise scheitert (Trennzeichen/
// Anführungszeichen/Zeilenumbrüche im Wert, leere Werte).
import { describe, expect, it } from 'vitest';
import { toCsv, type CsvColumn } from '../../ui/shell/csv';

interface Row {
  id: string;
  name: string;
  note: string | null;
}

const columns: CsvColumn<Row>[] = [
  { header: 'ID', value: (r) => r.id },
  { header: 'Name', value: (r) => r.name },
  { header: 'Notiz', value: (r) => r.note },
];

describe('toCsv', () => {
  it('beginnt mit der UTF-8-BOM', () => {
    const csv = toCsv([], columns);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('serialisiert Kopfzeile + eine Datenzeile mit `;` als Trennzeichen', () => {
    const csv = toCsv([{ id: '@I1@', name: 'Anna Bauer', note: 'ok' }], columns);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toBe('ID;Name;Notiz');
    expect(lines[1]).toBe('@I1@;Anna Bauer;ok');
  });

  it('leere/null-Werte werden zu leeren Zellen (nicht "null"/"undefined")', () => {
    const csv = toCsv([{ id: '@I1@', name: '', note: null }], columns);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[1]).toBe('@I1@;;');
  });

  it('quotiert einen Wert, der das Trennzeichen `;` enthält', () => {
    const csv = toCsv([{ id: '@I1@', name: 'Bauer; Meyer', note: '' }], columns);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[1]).toBe('@I1@;"Bauer; Meyer";');
  });

  it('quotiert einen Wert mit Anführungszeichen und verdoppelt sie', () => {
    const csv = toCsv([{ id: '@I1@', name: 'Der "Alte"', note: '' }], columns);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[1]).toBe('@I1@;"Der ""Alte""";');
  });

  it('quotiert einen Wert mit eingebettetem Zeilenumbruch', () => {
    const csv = toCsv([{ id: '@I1@', name: 'Anna', note: 'Zeile1\nZeile2' }], columns);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    // Der eingebettete \n bleibt im gequoteten Feld erhalten, sprengt also NICHT die
    // \r\n-Zeilentrennung zwischen den Datensätzen.
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('@I1@;Anna;"Zeile1\nZeile2"');
  });

  it('mehrere Zeilen bleiben in der übergebenen Reihenfolge (gefiltert+sortiert kommt vom Aufrufer)', () => {
    const csv = toCsv(
      [
        { id: '@I2@', name: 'Otto', note: '' },
        { id: '@I1@', name: 'Anna', note: '' },
      ],
      columns,
    );
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines.slice(1)).toEqual(['@I2@;Otto;', '@I1@;Anna;']);
  });

  it('Kopfzeile allein bei leerer Zeilenmenge (kein Absturz)', () => {
    const csv = toCsv([], columns);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines).toEqual(['ID;Name;Notiz']);
  });

  it('numerische Werte werden zu Text', () => {
    interface NumRow { n: number }
    const numCols: CsvColumn<NumRow>[] = [{ header: 'Zahl', value: (r) => r.n }];
    const csv = toCsv([{ n: 42 }], numCols);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[1]).toBe('42');
  });
});
