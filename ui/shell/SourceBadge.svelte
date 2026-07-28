<script lang="ts">
  // ui/shell/SourceBadge.svelte — §N-Badge mit Beweiskraft-Meter (Spec 21 §7, ADR-v9-118).
  // Die Pille kodiert PRÄSENZ ("diese Angabe ist belegt", durchgängig gold, nie rot);
  // die QUAY-Beweiskraft trägt der QuayMeter (gefüllte Pips 0..3). Damit sieht ein Beleg
  // nie mehr aus wie ein Fehler (früher: q0-Rot ≈ --stb-danger).
  // Optionaler onSelect-Callback (Spec 20 §1.6 [K]): navigiert zur Quellen-Detailseite.
  // Ohne Callback bleibt es eine reine, nicht-interaktive Anzeige (z. B. künftige
  // Kontexte ohne Quellen-Tab-Zugriff) — INV-UI-2: EIN kanonischer Klick-Weg, kein
  // zweiter Navigations-Pfad daneben.
  import type { Citation, Source } from '../../core/model/types';
  import { badgeLabel, badgeTitle, badgeLinkHref } from './source-badge';
  import QuayMeter from './QuayMeter.svelte';
  import { tooltip } from './tooltip';

  interface Props {
    citation: Citation;
    source: Source | undefined;
    onSelect?: (sourceId: string) => void;
  }
  const { citation, source, onSelect }: Props = $props();

  // ↗-Weblink der Quellenreferenz (deepLinkUrl/OBJE-FILE bzw. PAGE-als-URL, analog v8).
  const href = $derived(badgeLinkHref(citation));
  const tip = $derived(badgeTitle(citation, source));
</script>

<!-- Pille + optionaler ↗ bleiben als EINE Umbruch-Einheit zusammen (INV-UI-5), damit der
     Link nicht von seiner Pille weg umbricht; nach außen wirkt der Wrapper wie ein Flex-Item.
     Mit Link (--linked) dockt der ↗ als „links geöffnete" Ergänzungs-Pille direkt an die
     Hauptpille an — beide lesen als EINE Pille mit zwei Kammern (Name | Weblink). -->
<span class="src-badge-wrap" class:src-badge-wrap--linked={href}>
  {#if onSelect}
    <button
      type="button"
      class="src-badge src-badge--clickable"
      aria-label={tip}
      use:tooltip={tip}
      onclick={() => onSelect(citation.sourceId)}
    >
      <span class="src-badge__label">{badgeLabel(citation, source)}</span><QuayMeter quay={citation.quay} />
    </button>
  {:else}
    <span class="src-badge" aria-label={tip} use:tooltip={tip}>
      <span class="src-badge__label">{badgeLabel(citation, source)}</span><QuayMeter quay={citation.quay} />
    </span>
  {/if}
  {#if href}
    <a
      class="src-badge-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Weblink zur Quelle öffnen"
      use:tooltip={href}
    >
      ↗
    </a>
  {/if}
</span>

<style>
  .src-badge-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.2em;
  }

  /* Mit Weblink dockt die Ergänzungs-Pille bündig an — kein Zwischenraum, geteilte Naht. */
  .src-badge-wrap--linked {
    gap: 0;
  }

  .src-badge-link {
    display: inline-flex;
    align-items: center;
    font-size: 0.72rem;
    line-height: 1;
    color: var(--stb-gold-light);
    text-decoration: none;
    cursor: pointer;
  }

  /* „Links geöffnete" Ergänzungs-Pille: flache linke Ecken (dockt an die Hauptpille),
     rechts abgerundet wie die Hauptpille. Gleiche Fläche/Rand; die linke Kante ist die
     geteilte Naht (Hauptpille trägt sie), daher hier border-left: none. */
  .src-badge-wrap--linked .src-badge-link {
    padding: 0.2em 0.4em;
    border: 1px solid var(--stb-gold-dim);
    border-left: none;
    border-radius: 0 9px 9px 0;
    background: var(--stb-surface-3);
    font-size: 0.66rem;
  }

  /* Die Hauptpille gibt rechts ihre Rundung auf, damit die Naht plan verläuft. */
  .src-badge-wrap--linked > .src-badge {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .src-badge-link:hover,
  .src-badge-link:focus-visible {
    color: var(--stb-gold);
  }

  .src-badge-wrap--linked .src-badge-link:hover,
  .src-badge-wrap--linked .src-badge-link:focus-visible {
    background: var(--stb-surface-2);
    border-color: var(--stb-gold);
  }

  /* Präsenz-Kanal: EINE affirmative Farbe (Gold) für „belegt" — nie QUAY-abhängig,
     nie Alarm-Rot. Die Beweiskraft trägt der eingebettete QuayMeter (ADR-v9-118). */
  .src-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.28em;
    max-width: 100%;
    font-size: 0.62rem;
    line-height: 1;
    padding: 0.2em 0.45em;
    border-radius: 9px;
    font-weight: 600;
    color: var(--stb-gold-light);
    background: var(--stb-surface-3);
    border: 1px solid var(--stb-gold-dim);
  }

  /* Dichte-Schutz zusätzlich zur Zeichen-Kappung in badgeLabel (ADR-v9-120): auf schmalen
     Zeilen bindet die CSS-Ellipse die sichtbare Breite responsiv, der volle Name bleibt im
     Tooltip. Der Meter (Geschwister) bleibt davon unberührt sichtbar. */
  .src-badge__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 11em;
  }

  button.src-badge--clickable {
    font-family: inherit;
    cursor: pointer;
  }

  button.src-badge--clickable:hover,
  button.src-badge--clickable:focus-visible {
    background: var(--stb-surface-2);
    border-color: var(--stb-gold);
  }
</style>
