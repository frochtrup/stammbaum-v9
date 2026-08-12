<script lang="ts">
  // ui/shell/EventDateFields.svelte — die Datumszeile (Qualifier + Tag/Monat/Jahr, bei
  // BET/FROM die zweite Grenze) — extrahiert aus `EventEditModal.svelte` (BL-352,
  // ADR-v9-264 „die eine echte Baustein-Lücke"). Bis hierher stand dieses Markup NUR dort
  // inline, geteilt war bislang nur seine Logik (`ui/shell/event-edit.ts`: QUALIFIER_OPTIONS,
  // markDateDirty, onMonthBlur). Zweiter Konsument ist `EntryTemplateCapture.svelte`
  // (BL-352), das mehrere Datums-Slots gleichzeitig zeigen kann — deshalb der optionale
  // `ariaPrefix` (INV-UI-4, dasselbe Muster wie EventPlaceField/EventAddrField's `label`-
  // Prop): ohne Prefix bleiben die aria-labels BYTE-GLEICH zur vorherigen Inline-Fassung
  // ("Datums-Qualifier"/"Tag"/"Monat"/"Jahr"/"Tag (Ende)"/"Monat (Ende)"/"Jahr (Ende)") —
  // daran hängen bestehende Tests (EventEditModal.component.test.ts) und das a11y-Gate.
  //
  // Arbeitet auf `EditableDate` (ui/shell/event-edit.ts), NICHT dem vollen `EditableEvent`
  // — EntryTemplateCapture hat vor dem Speichern kein Ereignis, nur einen Entwurfswert je
  // Slot. `EditableEvent` erfüllt `EditableDate` strukturell, EventEditModal reicht sein
  // `editable` also unverändert durch. Mutation läuft DIREKT auf dem übergebenen Objekt
  // (Objekt-Referenz, kein `$bindable` nötig) — exakt wie das bisherige Inline-Markup es tat.
  import { PLAIN_FIELD } from './plain-input';
  import { markDateDirty, onMonthBlur, QUALIFIER_OPTIONS, type EditableDate } from './event-edit';

  interface Props {
    editable: EditableDate;
    /** aria-label-Vorsatz für mehrere gleichzeitig sichtbare Datumszeilen (leer = die
     *  ursprünglichen, unpräfigierten Labels — EventEditModal zeigt immer nur EIN
     *  Ereignis, braucht also keinen). */
    ariaPrefix?: string;
  }
  const { editable, ariaPrefix = '' }: Props = $props();

  function ariaLabel(suffix: string): string {
    return ariaPrefix ? `${ariaPrefix} ${suffix}` : suffix;
  }
</script>

<div class="event-date-fields">
  <select
    aria-label={ariaLabel('Datums-Qualifier')}
    value={editable.dateQualifier}
    onchange={(e) => {
      editable.dateQualifier = (e.currentTarget as HTMLSelectElement).value as EditableDate['dateQualifier'];
      markDateDirty(editable);
    }}
  >
    {#each QUALIFIER_OPTIONS as q (q.value)}
      <option value={q.value}>{q.label}</option>
    {/each}
  </select>
  <input
    type="number"
    placeholder="Tag"
    aria-label={ariaLabel('Tag')}
    value={editable.day ?? ''}
    onchange={(e) => {
      const v = (e.currentTarget as HTMLInputElement).value;
      editable.day = v === '' ? null : Number(v);
      markDateDirty(editable);
    }}
    class="event-date-fields__day"
  />
  <input
    type="text" {...PLAIN_FIELD}
    placeholder="Monat"
    aria-label={ariaLabel('Monat')}
    value={editable.month ?? ''}
    onchange={(e) => onMonthBlur(editable, 'month', (e.currentTarget as HTMLInputElement).value)}
  />
  <input
    type="number"
    placeholder="Jahr"
    aria-label={ariaLabel('Jahr')}
    value={editable.year ?? ''}
    onchange={(e) => {
      const v = (e.currentTarget as HTMLInputElement).value;
      editable.year = v === '' ? null : Number(v);
      markDateDirty(editable);
    }}
    class="event-date-fields__year"
  />
  {#if editable.dateQualifier === 'BET' || editable.dateQualifier === 'FROM'}
    <span class="event-date-fields__muted">{editable.dateQualifier === 'BET' ? 'und' : 'bis'}</span>
    <input
      type="number"
      placeholder="Tag"
      aria-label={ariaLabel('Tag (Ende)')}
      value={editable.day2 ?? ''}
      onchange={(e) => {
        const v = (e.currentTarget as HTMLInputElement).value;
        editable.day2 = v === '' ? null : Number(v);
        markDateDirty(editable);
      }}
      class="event-date-fields__day"
    />
    <input
      type="text" {...PLAIN_FIELD}
      placeholder="Monat"
      aria-label={ariaLabel('Monat (Ende)')}
      value={editable.month2 ?? ''}
      onchange={(e) => onMonthBlur(editable, 'month2', (e.currentTarget as HTMLInputElement).value)}
    />
    <input
      type="number"
      placeholder="Jahr"
      aria-label={ariaLabel('Jahr (Ende)')}
      value={editable.year2 ?? ''}
      onchange={(e) => {
        const v = (e.currentTarget as HTMLInputElement).value;
        editable.year2 = v === '' ? null : Number(v);
        markDateDirty(editable);
      }}
      class="event-date-fields__year"
    />
  {/if}
</div>

<style>
  .event-date-fields {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.6rem;
  }

  /* Feste/begrenzte Feldbreiten (INV-UI-5, ADR-v9-30 Punkt 4 Nachtrag — identische Werte
     wie PersonForm.svelte/FamilyForm.svelte, dort ausführlich per preview_resize(mobile)
     auf 375px verifiziert): Qualifier(5.5rem)+Tag(3.2rem)+Monat(3.6rem)+Jahr(3.2rem) + 3
     Gaps passen auf die primäre Mobile-Zielbreite in eine Zeile. */
  .event-date-fields select {
    flex: 0 1 5.5rem;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }

  .event-date-fields input[type='text'] {
    width: 3.6rem;
    flex: 0 0 auto;
  }

  .event-date-fields__day,
  .event-date-fields__year {
    width: 3.2rem;
    flex: 0 0 auto;
  }

  .event-date-fields input[type='number'] {
    padding-left: 0.3rem;
    padding-right: 0.2rem;
  }

  .event-date-fields__muted {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }
</style>
