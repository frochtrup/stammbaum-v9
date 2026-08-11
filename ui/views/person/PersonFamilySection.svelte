<script lang="ts">
  // ui/views/person/PersonFamilySection.svelte — die Familien-Sektion des Personen-
  // Steckbriefs: Liste, Zuordnen und Anlegen je Rolle (BL-341, verfeinert in BL-344).
  //
  // DAS `+` SITZT AM ROLLEN-LABEL (Nutzer-Befund 2026-08-11: „wie wäre es mit einer
  // einfachen + pille hinter Herkunftsfamilie anstatt einer eigenen zeile und eine text
  // pille"). Der erste Bau setzte eine breite Text-Pille „+ Herkunftsfamilie" unter die
  // ganze Liste. Zwei Dinge stimmten daran nicht:
  //
  //   1. Die Affordanz saß nicht am bedeutungstragenden Element (INV-UI-12) — sie stand
  //      unter ALLEN Zeilen und sagte nur durch ihren Text, worauf sie sich bezieht. Am
  //      Label braucht sie keinen Text mehr: das Label sagt es.
  //   2. Sie deckte nur EINE der beiden Rollen ab. Eine EIGENE Familie ließ sich vom
  //      Steckbrief aus überhaupt nicht anlegen — dieselbe Lücke, eine Zeile höher, und
  //      sie fiel beim ersten Bau nicht auf, weil die meisten Personen bereits eine haben.
  //
  // Das `+` steht an JEDER Zeile ihrer Rolle und heißt dort „noch eine davon" — bei
  // Wiederheirat oder zweiter Herkunftsfamilie ist das genau die Handlung. Fehlt eine
  // Rolle ganz, trägt `PersonFamilies` eine Label-Zeile nur mit dem `+`: wer keine eigene
  // Familie hat, braucht den Weg dorthin am meisten (dieselbe Überlegung wie bei der
  // immer sichtbaren Geburtszeile, BL-339).
  import PersonFamilies from './PersonFamilies.svelte';
  import FamilyPicker from '../../shell/FamilyPicker.svelte';
  import { makeFamily } from '../../../core/model/factory';
  import { allocatorFromDatabase, nextId } from '../../../core/model';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { Source } from '../../../core/model/types';
  import type { FamilyNavRow } from './person-detail-model';

  type Rolle = 'parentIn' | 'childOf';

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

  /** Welche Rolle hat gerade ihren Picker offen? `null` = keiner. */
  let pickerFuer = $state<Rolle | null>(null);

  const hinweis = (r: Rolle): string =>
    r === 'parentIn' ? 'Eigene Familie zuordnen oder anlegen' : 'Herkunftsfamilie zuordnen oder anlegen';

  /**
   * In welchen Eltern-Slot gehört diese Person in ihrer EIGENEN Familie? Nach `sex`; bei
   * `U` in den Ehemann-Slot. Eine Vorbelegung, keine Behauptung — direkt nach dem Anlegen
   * steht der Nutzer auf der Familienseite und kann beide Slots umbesetzen.
   */
  const elternSlot = (): 'husband' | 'wife' =>
    appState.db.individuals.get(personId)?.sex === 'F' ? 'wife' : 'husband';

  // BEIDE Wege gehen über `saveFamily` — nicht über `saveChildLink`, das ausdrücklich nur
  // einen BESTEHENDEN Link aktualisiert (`if (i < 0) return`). `saveFamily` führt sowohl
  // die Kinder-Differenz (`addChildToFamily`) als auch den Eltern-Wechsel
  // (`addParentToFamily`) nach und hält damit INV-P3 (beide Seiten der Beziehung) ein.
  function ordneZu(rolle: Rolle, familyId: string) {
    pickerFuer = null;
    const fam = appState.db.families.get(familyId);
    if (!fam) return;
    if (rolle === 'childOf') {
      if (fam.children.includes(personId)) return; // schon Kind — kein Doppeleintrag
      appState.saveFamily({ ...fam, children: [...fam.children, personId] });
    } else {
      const slot = elternSlot();
      if (fam[slot] === personId) return;
      appState.saveFamily({ ...fam, [slot]: personId });
    }
  }

  function legeAn(rolle: Rolle) {
    pickerFuer = null;
    const id = nextId(allocatorFromDatabase(appState.db), 'F');
    // Ein Kommando, nicht zwei: `saveFamily` legt die Familie an UND setzt die Beziehung
    // (der `!prev`-Zweig setzt erst das Gerüst, dann laufen die Deltas).
    const geruest = rolle === 'childOf'
      ? makeFamily(id, { children: [personId] })
      : makeFamily(id, { [elternSlot()]: personId });
    appState.saveFamily(geruest);
    // Springen (Nutzer-Entscheidung 2026-08-11): die neue Familie ist fast leer, und der
    // nächste Schritt — die Gegenperson eintragen — geht nur dort.
    onNavigateToFamily?.(id);
  }
</script>

<!-- Die Sektion steht IMMER, nicht nur bei vorhandenen Familien: sonst hätte ausgerechnet
     die Person ohne Familie keinen Ort, an dem sie eine bekommen könnte (BL-339). -->
<section class="person-detail__section">
  <h3 class="stb-section-title">Familien</h3>

  <PersonFamilies
    {families}
    {onGoToPerson}
    {onNavigateToFamily}
    {onNavigateToSource}
    {sourceOf}
    {onEditChildLink}
    onAdd={(rolle) => (pickerFuer = rolle)}
    addHinweis={hinweis}
  />

  {#if pickerFuer}
    <!-- EIN Einstieg, zwei Wege: der Picker sucht, und wenn nichts passt, trägt seine
         letzte Zeile die Neuanlage (`createLabel`, seit jeher in `Picker.svelte`).
         Dieselbe Reihenfolge wie beim Ort und beim Hof — erst suchen, dann anlegen
         (ADR-v9-42). Die Kurations-Sorge der ADR-024-Familie greift hier nicht: sie gilt
         der automatischen Massenanlage beim Import, nicht einer einzelnen, durch die Suche
         davor bereits geprüften Handlung im Editiermodus. -->
    <div class="person-family-section__picker">
      <FamilyPicker
        {appState}
        value={null}
        startOpen={true}
        label={hinweis(pickerFuer)}
        placeholder="Familie suchen …"
        createLabel="＋ Neue Familie anlegen und zuordnen"
        onCreateRequested={() => pickerFuer && legeAn(pickerFuer)}
        onChange={(id) => id && pickerFuer && ordneZu(pickerFuer, id)}
        onClose={() => (pickerFuer = null)}
      />
    </div>
  {/if}
</section>

<style>
  .person-family-section__picker {
    margin-top: 0.5rem;
  }
</style>
