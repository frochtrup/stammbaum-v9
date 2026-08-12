// tests/ui/confirm-helper.ts — die Rückfrage vor einer destruktiven Aktion BEDIENEN,
// statt sie wegzudefinieren (BL-351).
//
// WARUM ES DIESE DATEI GIBT. Bis hierher stand in jedem Lösch-Test `vi.stubGlobal(
// 'confirm', () => true)`. Das prüfte alles außer der Rückfrage selbst — und genau sie
// war kaputt: in der Vorschau-Fläche liefert `window.confirm` sofort `false`, ohne je
// einen Dialog zu zeigen, jede bestätigungspflichtige Aktion war dort wirkungslos.
// Aufgefallen ist es dem Nutzer, nicht den 4300 Tests (CLAUDE.md: „ein Wächter, dessen
// Rot-Fall nie gesehen wurde, ist unbelegt").
//
// Seit `ConfirmDialog` ist die Rückfrage Teil des gerenderten Baums. Diese Helfer
// klicken sie an — dieselbe Handlung wie ein Nutzer, ohne Stub.
import { fireEvent, screen, within } from '@testing-library/svelte';

/** Der offene Rückfrage-Dialog (`role="alertdialog"`), sobald er erschienen ist. */
export async function rueckfrage(): Promise<HTMLElement> {
  return (await screen.findByRole('alertdialog')) as HTMLElement;
}

/**
 * Bestätigt die offene Rückfrage.
 * `aktion` ist die Beschriftung des bestätigenden Knopfes — Vorgabe „Löschen", weil das
 * der häufigste Fall ist; „Entfernen"/„Ersetzen" gibt es ebenfalls.
 */
export async function bestaetige(aktion: string | RegExp = 'Löschen'): Promise<void> {
  const dialog = await rueckfrage();
  await fireEvent.click(within(dialog).getByRole('button', { name: aktion }));
}

/** Bricht die offene Rückfrage ab (der Weg, den „abgebrochenes confirm" früher meinte). */
export async function brichAb(): Promise<void> {
  const dialog = await rueckfrage();
  await fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
}

/** Steht gerade eine Rückfrage offen? Für die Gegenprobe „es wurde NICHT gefragt". */
export function rueckfrageOffen(): boolean {
  return screen.queryByRole('alertdialog') !== null;
}
