<script lang="ts">
  // ui/shell/ReviewedToggle.svelte — DER EINE „geprüft"-Schalter (Spec 11 §9.1,
  // ADR-v9-191), genutzt von PlaceDetail und HofDetail (INV-UI-4: ein Mechanismus, nicht
  // pro View neu erfunden — Ort und Hof stellen dieselbe Frage).
  //
  // Er ist die EINZIGE Stelle, an der `reviewedAt` entsteht: kein Lade-, Seed-, Bootstrap-
  // oder Merge-Pfad setzt den Marker, und Bearbeiten allein ebenfalls nicht. Nur so sagt er
  // etwas über einen Menschen aus.
  //
  // BEIDE ZUSTÄNDE TRAGEN EIGENEN TEXT, nicht nur eine andere Farbe (Spec 21 §2):
  // „Geprüft markieren" vs. „✓ Geprüft <Datum>". Ein Umschalter, dessen Zustand allein an
  // der Füllung hängt, ist auf dem Telefon kein Kanal.
  //
  // WORTLÄNGE IST HIER EIN LAYOUT-VERTRAG (BL-273). Der Knopf steht in der Detail-Kopfzeile
  // neben „← Zurück" und „✎ Bearbeiten"; bei 375px bleiben ihm gemessene 150px, sonst bricht
  // die Kopfzeile um. Seit er die 44px-Trefferfläche aus `.stb-btn` trägt, ist das knapp:
  // „Als geprüft markieren" maß 158px. Gekürzt wurde deshalb der TEXT, nicht das
  // Bedienelement (Spec 21 §6i: „Eine Trefferfläche gibt nie nach") — „Geprüft markieren"
  // (140px) und, im Ein-Zustand, ein zweistelliges Jahr (140px statt 153px).
  // Das DATUM BLEIBT SICHTBAR und wandert nicht in den Tooltip: eine Datierung, die es auf
  // dem Telefon nicht gibt, ist keine Anzeige (BL-251, [20 §1.7]). Der Tooltip führt
  // weiterhin das volle Jahr.
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
  /** Knopf-Fassung: zweistelliges Jahr, s. Wortlängen-Vertrag oben. */
  const datumKurz = $derived(
    reviewedAt != null
      ? new Date(reviewedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
      : '',
  );
  const titel = $derived(
    geprueft
      ? `Am ${datum} als geprüft markiert — klicken, um die Markierung aufzuheben. Sie sagt „ein Mensch hat entschieden", nicht „vollständig".`
      : `Diesen ${kind} als geprüft markieren: angesehen und für richtig befunden, auch wenn nichts zu ergänzen war.`,
  );
</script>

<!-- Nimmt die geteilte Button-Primitive (BL-273/INV-UI-4): der Knopf steht in DERSELBEN
     Kopfzeile wie „✎ Bearbeiten", und ein 25px-Knopf neben einem 44px-Knopf liest sich als
     Versehen. `--on` bleibt lokal — das ist der Zustand, nicht die Grundoptik. -->
<button
  type="button"
  class="stb-btn reviewed-toggle"
  data-variant="secondary"
  class:reviewed-toggle--on={geprueft}
  aria-pressed={geprueft}
  title={titel}
  aria-label={titel}
  onclick={() => onToggle(geprueft ? null : Date.now())}
>
  {geprueft ? `✓ Geprüft ${datumKurz}` : 'Geprüft markieren'}
</button>

<style>
  /* Nur noch das, was `.stb-btn[data-variant="secondary"]` NICHT sagt: der ungeprüfte
     Zustand ist leiser als eine normale Sekundäraktion, und die Beschriftung bricht nicht. */
  .reviewed-toggle {
    color: var(--stb-text-dim);
    border-color: var(--stb-surface-2);
    white-space: nowrap;
  }

  .reviewed-toggle--on {
    color: var(--stb-gold);
    border-color: var(--stb-gold);
  }
</style>
