// @vitest-environment happy-dom
// tests/orte/zwei-fenster.component.test.ts — Liste und Steckbrief nebeneinander
// (OE-11, Spec 22 §6, ADR-v9-171).
//
// WARUM DAS MEHR IST ALS EINE LAYOUT-VORLIEBE: `DetailHeader` blendet „← Zur Liste"
// oberhalb der Layout-Grenze aus, mit der Begründung, im Multi-Pane stehe die Liste
// ohnehin daneben. Solange der Editor eine Ein-Fenster-Fläche war, stimmte diese
// Begründung für ihn NICHT — auf Desktop-Breite gab es dort gar keinen Rückweg mehr.
// Die zwei Fenster lösen das strukturell auf, statt eine Ausnahme in die geteilte
// Komponente zu schreiben (INV-ORTE-1: Abweichung nur als benannte Fähigkeit).
//
// Fachlich ist es zudem der richtige Arbeitsmodus: Ortskuration ist Vergleichsarbeit
// (Schreibvarianten, Dubletten, Verwaltungsketten) — anders als im Hauptprogramm, wo die
// Liste ein Index zum Überfliegen ist.
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import OrteApp from '../../app-orte/OrteApp.svelte';
import { layout } from '../../ui/shell/layout.svelte';
import { pinLayout } from '../ui/layout-harness';

afterEach(() => layout.reset());

/** Lädt ein Dokument über den echten Picker-Weg (verstecktes `input[type=file]`). */
async function ladeDokument(inhalt: object) {
  await fireEvent.click(screen.getByText('Öffnen'));
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  const datei = new File([JSON.stringify(inhalt)], 'orte.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [datei], configurable: true });
  await fireEvent.change(input);
  await new Promise((r) => setTimeout(r, 30));
}

const DOKUMENT = {
  schemaVersion: 1,
  rev: 1,
  device: 'test',
  ts: 0,
  placeObjects: [
    { id: '@P1@', title: 'Albersloh', shortName: '', type: 'Village', pnames: [], translations: [], enclosedBy: [], lat: null, long: null, note: '', existsFrom: null, existsTo: null, govId: null, govTypes: null },
    { id: '@P2@', title: 'Ochtrup', shortName: '', type: 'Village', pnames: [], translations: [], enclosedBy: [], lat: null, long: null, note: '', existsFrom: null, existsTo: null, govId: null, govTypes: null }
  ],
  hofObjects: []
};

describe('Orte-Editor auf Desktop-Breite', () => {
  it('zeigt Liste und Steckbrief gleichzeitig', async () => {
    const unpin = pinLayout(true);
    try {
      render(OrteApp);
      await ladeDokument(DOKUMENT);

      expect(document.querySelector('.orte-app__panes')).toBeTruthy();
      // Die Liste bleibt stehen, während der Steckbrief daneben rendert.
      expect(document.querySelector('.orte-app__pane--list')).toBeTruthy();
      expect(document.querySelector('.orte-app__pane--detail')).toBeTruthy();
      expect(screen.getAllByText('Albersloh').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ochtrup').length).toBeGreaterThan(0);
    } finally {
      unpin();
    }
  });

  it('behält die Liste sichtbar, nachdem ein Ort gewählt wurde', async () => {
    const unpin = pinLayout(true);
    try {
      render(OrteApp);
      await ladeDokument(DOKUMENT);

      await fireEvent.click(screen.getAllByText('Albersloh')[0]);
      // Der andere Ort steht weiterhin in der Liste — genau das ist der Zweck.
      expect(screen.getAllByText('Ochtrup').length).toBeGreaterThan(0);
      expect(document.querySelector('.orte-app__pane--list')).toBeTruthy();
      // Und deshalb ist hier KEIN Rückweg nötig (DetailHeader-Regel, jetzt zutreffend).
      expect(screen.queryByText('← Zur Liste')).toBeNull();
    } finally {
      unpin();
    }
  });
});

describe('Orte-Editor auf Mobil-Breite', () => {
  it('zeigt EIN Fenster und einen Rückweg aus dem Steckbrief', async () => {
    const unpin = pinLayout(false);
    try {
      render(OrteApp);
      await ladeDokument(DOKUMENT);

      expect(document.querySelector('.orte-app__panes')).toBeNull();
      await fireEvent.click(screen.getAllByText('Albersloh')[0]);

      // Hier ersetzt der Steckbrief die Liste — ohne „← Zur Liste" gäbe es keinen Weg
      // zurück. Genau dieser Knopf fehlte im gemeldeten Fehlerbild.
      expect(screen.getByText('← Zur Liste')).toBeTruthy();
    } finally {
      unpin();
    }
  });

  it('kehrt über den Rückweg zur Liste zurück', async () => {
    const unpin = pinLayout(false);
    try {
      render(OrteApp);
      await ladeDokument(DOKUMENT);
      await fireEvent.click(screen.getAllByText('Albersloh')[0]);
      await fireEvent.click(screen.getByText('← Zur Liste'));

      expect(screen.getAllByText('Ochtrup').length).toBeGreaterThan(0);
      expect(screen.queryByText('← Zur Liste')).toBeNull();
    } finally {
      unpin();
    }
  });
});
