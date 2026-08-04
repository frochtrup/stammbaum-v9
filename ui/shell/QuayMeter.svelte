<script lang="ts">
  // ui/shell/QuayMeter.svelte — Beweiskraft-Meter (Spec 21 §7, ADR-v9-118). Geteiltes
  // Primitiv (INV-UI-4): SourceBadge UND SourceDetail zeigen die QUAY-Stufe hierüber,
  // keine pro-View-Kopie. Die Stufe 0..3 wird über die ANZAHL gefüllter Pips kodiert
  // (Position/Zählung), Farbe nur redundant. Damit:
  //   - braucht Stufe 0 keine Farbe (null Pips) → die frühere Kollision q0-Rot
  //     (#c0504a) ≈ --stb-danger (#c04040) entfällt; „belegt" sieht nie aus wie „Fehler".
  //   - ist die Skala monoton lesbar (mehr Pips = stärker), statt rot→orange→blau→grün,
  //     dessen Blau die Reihenfolge brach und mit --stb-sex-m kollidierte.
  //   - bleibt sie farbenblind-robust und für Screenreader über aria-label zugänglich.
  // Bewusst NICHT an --stb-quay-0..3 gekoppelt: jene bleiben als generische Status-Palette
  // in Dedup-/Review-Ansichten (HofReview, PlaceDedupView, …) unverändert in Nutzung.
  import type { Citation } from '../../core/model/types';
  import { quayAriaLabel } from './source-badge';

  interface Props {
    quay: Citation['quay'];
  }
  const { quay }: Props = $props();
  // `null` = nicht bewertet (BL-302). Gezeichnet wie Stufe 0 (null Pips) — die Skala hat
  // nur drei Pips; unterschieden wird im aria-label, wo der Unterschied auch trägt.
  const stufe = $derived(quay ?? 0);
</script>

<span class="quay-meter" data-quay={stufe} role="img" aria-label={quayAriaLabel(quay)}>
  {#each [1, 2, 3] as level (level)}
    <i class="quay-meter__pip {level <= stufe ? 'quay-meter__pip--on' : ''}"></i>
  {/each}
</span>

<style>
  .quay-meter {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    vertical-align: middle;
  }
  .quay-meter__pip {
    width: 5px;
    height: 5px;
    border-radius: 1px;
    box-sizing: border-box;
    border: 1px solid var(--stb-quay-meter-empty);
    background: transparent;
  }
  .quay-meter__pip--on {
    border-color: transparent;
  }
  /* Farbe redundant zur Füll-Anzahl: amber → gold → grün (monoton, kein Alarm-Rot). */
  .quay-meter[data-quay='1'] .quay-meter__pip--on {
    background: var(--stb-quay-meter-1);
  }
  .quay-meter[data-quay='2'] .quay-meter__pip--on {
    background: var(--stb-quay-meter-2);
  }
  .quay-meter[data-quay='3'] .quay-meter__pip--on {
    background: var(--stb-quay-meter-3);
  }
</style>
