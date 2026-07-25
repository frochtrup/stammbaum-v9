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
     Link nicht von seiner Pille weg umbricht; nach außen wirkt der Wrapper wie ein Flex-Item. -->
<span class="src-badge-wrap">
  {#if onSelect}
    <button
      type="button"
      class="src-badge src-badge--clickable"
      aria-label={tip}
      use:tooltip={tip}
      onclick={() => onSelect(citation.sourceId)}
    >
      {badgeLabel(citation)}<QuayMeter quay={citation.quay} />
    </button>
  {:else}
    <span class="src-badge" aria-label={tip} use:tooltip={tip}>
      {badgeLabel(citation)}<QuayMeter quay={citation.quay} />
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

  .src-badge-link {
    font-size: 0.72rem;
    line-height: 1;
    color: var(--stb-gold-light);
    text-decoration: none;
    cursor: pointer;
  }

  .src-badge-link:hover,
  .src-badge-link:focus-visible {
    color: var(--stb-gold);
  }

  /* Präsenz-Kanal: EINE affirmative Farbe (Gold) für „belegt" — nie QUAY-abhängig,
     nie Alarm-Rot. Die Beweiskraft trägt der eingebettete QuayMeter (ADR-v9-118). */
  .src-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.28em;
    font-size: 0.62rem;
    line-height: 1;
    padding: 0.2em 0.45em;
    border-radius: 9px;
    font-weight: 600;
    color: var(--stb-gold-light);
    background: var(--stb-surface-3);
    border: 1px solid var(--stb-gold-dim);
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
