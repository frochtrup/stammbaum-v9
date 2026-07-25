// ui/shell/load-doc-text.ts — EIN Einstieg für beide Ladepfade (BL-139). Der Import-Knopf
// und der Auto-Load aus der Arbeitskopie müssen dieselbe Format-Verzweigung treffen; sie
// hier zu bündeln verhindert, dass die zwei Aufrufer auseinanderlaufen (INV-UI-4).
import type { DocFormat } from '../../services/file';
import { loadGedcomText } from './load-gedcom-text';
import { loadGrampsText } from './load-gramps-text';
import type { LoadGedcomTextResult } from './load-gedcom-text';
import type { AppState } from './app-state.svelte';
import type { PlacesPersister } from './places-persister';

export async function loadDocText(
  format: DocFormat,
  text: string,
  fileName: string,
  appState: AppState,
  persister: PlacesPersister,
): Promise<LoadGedcomTextResult> {
  return format === 'gramps'
    ? loadGrampsText(text, fileName, appState, persister)
    : loadGedcomText(text, fileName, appState, persister);
}
