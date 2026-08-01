<script lang="ts">
  // ui/shell/ReviewedToggle.svelte — DER EINE „geprüft"-Schalter (Spec 11 §9.1,
  // ADR-v9-191), genutzt von PlaceDetail und HofDetail (INV-UI-4: ein Mechanismus, nicht
  // pro View neu erfunden — Ort und Hof stellen dieselbe Frage).
  //
  // Er ist die EINZIGE Stelle, an der `reviewedAt` entsteht: kein Lade-, Seed-, Bootstrap-
  // oder Merge-Pfad setzt den Marker, und Bearbeiten allein ebenfalls nicht. Nur so sagt er
  // etwas über einen Menschen aus.
  //
  // BEIDE ZUSTÄNDE TRAGEN EIGENEN TEXT, nicht nur eine andere Farbe (Spec 21 §2): „Als
  // geprüft markieren" vs. „✓ Geprüft <Datum>". Ein Umschalter, dessen Zustand allein an
  // der Füllung hängt, ist auf dem Telefon kein Kanal.
  interface Props {
    /** Zeitstempel der Prüfung; `null`/`undefined` = nie geprüft. */
    reviewedAt?: number | null;
    /** Setzt (`Date.now()`) bzw. entfernt (`null`) den Marker. */
    onToggle: (at: number | null) => void;
    /** Wortlaut des Titels, z. B. „Ort"/„Hof" — nur für den Tooltip. */
    kind: string;
  }
  const { reviewedAt = null, onToggle, kind }: Props = $props();

  const geprueft = $derived(reviewedAt != null);
  const datum = $derived(
    reviewedAt != null ? new Date(reviewedAt).toLocaleDateString('de-DE') : '',
  );
  const titel = $derived(
    geprueft
      ? `Am ${datum} als geprüft markiert — klicken, um die Markierung aufzuheben. Sie sagt „ein Mensch hat entschieden", nicht „vollständig".`
      : `Diesen ${kind} als geprüft markieren: angesehen und für richtig befunden, auch wenn nichts zu ergänzen war.`,
  );
</script>

<button
  type="button"
  class="reviewed-toggle"
  class:reviewed-toggle--on={geprueft}
  aria-pressed={geprueft}
  title={titel}
  aria-label={titel}
  onclick={() => onToggle(geprueft ? null : Date.now())}
>
  {geprueft ? `✓ Geprüft ${datum}` : 'Als geprüft markieren'}
</button>

<style>
  .reviewed-toggle {
    background: transparent;
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-surface-2);
    border-radius: var(--stb-radius-control);
    padding: 0.25rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .reviewed-toggle--on {
    color: var(--stb-gold);
    border-color: var(--stb-gold);
  }
</style>
