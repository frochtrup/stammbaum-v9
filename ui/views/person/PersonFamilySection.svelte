<script lang="ts">
  // ui/views/person/PersonFamilySection.svelte — die Familien-Sektion des Personen-
  // Steckbriefs: Liste, Zuordnen und Anlegen einer Herkunftsfamilie (BL-341).
  //
  // AUS PersonDetail.svelte EXTRAHIERT, weil die Sektion mit dem Zuordnen/Anlegen eine
  // eigene, in sich geschlossene Einheit wurde (Anzeige + Picker-Zustand + zwei Kommandos)
  // und die Detailseite an die max-lines-Ratsche stieß. Großzügig geschnitten statt knapp
  // getrimmt: der Rest liegt danach komfortabel darunter, statt beim nächsten Zusatz
  // erneut anzustoßen.
  //
  // `PersonFamilies` bleibt daneben, was es war — reine Anzeige/Navigation ohne
  // Edit-Zustand. Der Picker-Zustand lebt hier, eine Ebene darüber.
  import PersonFamilies from './PersonFamilies.svelte';
  import FamilyPicker from '../../shell/FamilyPicker.svelte';
  import { makeFamily } from '../../../core/model/factory';
  import { allocatorFromDatabase, nextId } from '../../../core/model';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { Source } from '../../../core/model/types';
  import type { FamilyNavRow } from './person-detail-model';

  interface Props {
    appState: AppState;
    personId: string;
    families: FamilyNavRow[];
    onGoToPerson: (id: string) => void;
    onNavigateToFamily?: (id: string) => void;
    onNavigateToSource?: (sourceId: string) => void;
    sourceOf?: (sourceId: string) => Source | undefined;
    onEditChildLink?: (familyId: string) => void;
  }
  const {
    appState, personId, families,
    onGoToPerson, onNavigateToFamily, onNavigateToSource, sourceOf, onEditChildLink,
  }: Props = $props();

  let picker = $state(false);

  // BEIDE Wege gehen über `saveFamily` — nicht über `saveChildLink`, das ausdrücklich nur
  // einen BESTEHENDEN Link aktualisiert (`if (i < 0) return`). `saveFamily` führt die
  // Kinder-Differenz über `addChildToFamily` nach und hält damit INV-P3 (beide Seiten der
  // Beziehung) ein — dieselbe erprobte Bahn, die auch das Familien-Formular nimmt.
  function ordneZu(familyId: string) {
    picker = false;
    const fam = appState.db.families.get(familyId);
    if (!fam || fam.children.includes(personId)) return; // schon Kind — kein Doppeleintrag
    appState.saveFamily({ ...fam, children: [...fam.children, personId] });
  }

  function legeAn() {
    picker = false;
    const id = nextId(allocatorFromDatabase(appState.db), 'F');
    // Ein Kommando, nicht zwei: `saveFamily` legt die Familie an UND hängt das Kind ein
    // (der `!prev`-Zweig setzt erst das Gerüst, dann laufen die Kind-Deltas).
    appState.saveFamily(makeFamily(id, { children: [personId] }));
    // Springen (Nutzer-Entscheidung 2026-08-11): die neue Familie ist leer, und der nächste
    // Schritt — Vater und Mutter eintragen — geht nur dort. Auf der Person zu bleiben hieße,
    // den Nutzer mit einer Zeile zurückzulassen, die noch nichts sagt.
    onNavigateToFamily?.(id);
  }
</script>

<!-- Die Sektion steht IMMER, nicht mehr nur bei vorhandenen Familien: sonst hätte
     ausgerechnet die Person ohne Eltern keinen Ort, an dem sie welche bekommen könnte —
     dieselbe Falle wie bei der Geburtszeile (BL-339). Die LISTE bleibt an `families`
     gebunden; leer angezeigt wird nichts. -->
<section class="person-detail__section">
  <h3>Familien</h3>

  {#if families.length > 0}
    <PersonFamilies
      {families}
      {onGoToPerson}
      {onNavigateToFamily}
      {onNavigateToSource}
      {sourceOf}
      {onEditChildLink}
    />
  {/if}

  <div class="person-family-section__add">
    {#if picker}
      <!-- EIN Einstieg, zwei Wege: der Picker sucht, und wenn nichts passt, trägt seine
           letzte Zeile die Neuanlage (`createLabel`, seit jeher in `Picker.svelte`).
           Dieselbe Reihenfolge wie beim Ort und beim Hof — erst suchen, dann anlegen
           (ADR-v9-42). Die Kurations-Sorge der ADR-024-Familie greift hier nicht: sie gilt
           der automatischen Massenanlage beim Import, nicht einer einzelnen, durch die
           Suche davor bereits geprüften Handlung im Editiermodus. -->
      <FamilyPicker
        {appState}
        value={null}
        startOpen={true}
        label="Herkunftsfamilie suchen"
        placeholder="Familie suchen …"
        createLabel="＋ Neue Familie anlegen und zuordnen"
        onCreateRequested={legeAn}
        onChange={(id) => id && ordneZu(id)}
        onClose={() => (picker = false)}
      />
    {:else}
      <button type="button" class="stb-activation-pill" onclick={() => (picker = true)}>
        + Herkunftsfamilie
      </button>
    {/if}
  </div>
</section>

<style>
  .person-family-section__add {
    margin-top: 0.55rem;
  }
</style>
