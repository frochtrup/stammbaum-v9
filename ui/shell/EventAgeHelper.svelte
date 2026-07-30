<script lang="ts">
  // ui/shell/EventAgeHelper.svelte — Sterbealter → Geburtsdatum (BL-212, ADR-v9-156).
  // Aus EventEditModal extrahiert: eine in sich geschlossene Eingabehilfe (drei Zahlen +
  // ein Knopf + die Vorschau), die das Modal sonst über die max-lines-Ratsche (BL-54)
  // gehoben hätte.
  //
  // REIN TRANSIENT: das Alter ist kein Modellfeld und wird nirgends gespeichert (`AGE`
  // kommt im Realbestand 0× vor) — es dient ausschließlich dazu, das Geburtsdatum zu
  // errechnen. Kirchenbücher nennen oft nur „gestorben im Alter von …".
  //
  // Die Rechnung selbst liegt im Kern (`birthDateFromDeathAge`), inkl. der `CAL`-Kodierung
  // aus dem v8-Orakel — hier steht nur die Eingabe.
  import { birthDateFromDeathAge } from '../../core/model';
  import { formatDateForDisplay } from '../../core/model/gedcom-date';

  interface Props {
    /** AKTUELLES Sterbedatum aus dem Formular (nicht das gespeicherte) — sonst ergäbe ein
     *  eben erst eingetragenes Datum noch nichts. */
    deathDate: string | null;
    /** Merkt das errechnete Datum VOR — geschrieben wird es erst beim Speichern des
     *  Ereignisses (ADR-v9-168). `null` nimmt die Vormerkung zurück. */
    onStage: (birthDate: string | null) => void;
    /** Aktuell vorgemerkter Wert (kommt vom Modal zurück), damit die Hilfe den Zustand
     *  anzeigt statt ihn selbst zu halten — eine Wahrheit, nicht zwei. */
    staged: string | null;
  }
  const { deathDate, onStage, staged }: Props = $props();

  let years = $state<number | null>(null);
  let months = $state<number | null>(null);
  let days = $state<number | null>(null);

  const berechnet = $derived(birthDateFromDeathAge(deathDate, years, months, days));
  /** Lokalisierte Anzeige — der rohe GEDCOM-String (`CAL 7 DEC 1889`) ist Wire-Format und
   *  gehört nicht in die Oberfläche (INV-UI-9, dieselbe Quelle wie jede Ereigniszeile). */
  const berechnetLabel = $derived(berechnet ? formatDateForDisplay(berechnet) : '');
  const stagedLabel = $derived(staged ? formatDateForDisplay(staged) : '');

  function num(e: Event): number | null {
    const v = (e.currentTarget as HTMLInputElement).value;
    return v === '' ? null : Number(v);
  }
</script>

<div class="age-helper">
  <span class="age-helper__caption">Alter bei Tod (für die Geburtsdatums-Berechnung)</span>
  <div class="age-helper__row">
    <input type="number" min="0" placeholder="Jahre" aria-label="Alter: Jahre" value={years ?? ''} onchange={(e) => (years = num(e))} />
    <input type="number" min="0" placeholder="Monate" aria-label="Alter: Monate" value={months ?? ''} onchange={(e) => (months = num(e))} />
    <input type="number" min="0" placeholder="Tage" aria-label="Alter: Tage" value={days ?? ''} onchange={(e) => (days = num(e))} />
  </div>
  <button
    type="button"
    class="age-helper__btn"
    disabled={!berechnet}
    onclick={() => berechnet && onStage(berechnet)}
  >
    {berechnet ? `Geburtsdatum vormerken: ${berechnetLabel}` : 'Geburtsdatum berechnen'}
  </button>
  {#if staged}
    <p class="age-helper__staged">
      Geburtsdatum wird beim Speichern auf <strong>{stagedLabel}</strong> gesetzt.
      <button type="button" class="age-helper__undo" onclick={() => onStage(null)}>Vormerkung verwerfen</button>
    </p>
  {/if}
</div>

<style>
  .age-helper {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .age-helper__caption {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }

  .age-helper__row {
    display: flex;
    gap: 0.4rem;
  }

  .age-helper__row input {
    flex: 1 1 0;
    min-width: 0;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
  }

  .age-helper__btn {
    align-self: flex-start;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    font-size: 0.82rem;
    cursor: pointer;
    min-height: var(--stb-touch-target);
  }

  .age-helper__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .age-helper__staged {
    margin: 0;
    font-size: 0.78rem;
    color: var(--stb-text);
  }

  .age-helper__staged strong {
    color: var(--stb-gold-light);
  }

  .age-helper__undo {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    padding: 0.2rem 0;
  }
</style>
