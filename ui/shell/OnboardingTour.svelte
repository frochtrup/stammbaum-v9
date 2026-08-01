<script lang="ts">
  // ui/shell/OnboardingTour.svelte — der Erstnutzer-Rundgang (BL-213, ADR-v9-190).
  // Vier Schritte, je ein freigestelltes Element („Spotlight") plus Erklär-Karte.
  //
  // Was hier NICHT liegt: welche Schritte es gibt und wo die Karte hingehört — das ist
  // `onboarding-model.ts` (rein, ohne DOM, getestet). Diese Datei misst, zeichnet und
  // hört auf Tasten, sonst nichts.
  //
  // Das Loch entsteht mit EINEM Element: ein durchsichtiges Rechteck mit einem riesigen
  // `box-shadow` nach außen verdunkelt alles daneben. v8 legte dafür vier Streifen
  // (`ob-top/left/right/bottom`) an und rechnete für jeden Kanten-Koordinaten aus — vier
  // Elemente, die einzeln falsch stehen können, für dieselbe Wirkung.
  //
  // Der Rundgang ist bewusst NICHT modal im Sinne von „fängt jeden Klick ab": der
  // Backdrop ist `pointer-events: none`, damit das freigestellte Element weiterhin
  // bedienbar bleibt — wer während des Rundgangs die Liste antippt, soll die Person
  // sehen. Beendet wird über „Fertig", „Überspringen" oder Escape (LP-8/§6i).
  import { onMount, tick } from 'svelte';
  import { portal } from './portal';
  import { tourSteps, stepLabel, spotlightHole, cardPosition, type Box } from './onboarding-model';

  interface Props {
    /**
     * Wird beim Öffnen gerufen, BEVOR gemessen wird — der Rundgang sorgt damit selbst
     * dafür, dass seine Ziele überhaupt auf dem Schirm sind.
     *
     * Ohne das lief er dort los, wo „Demo laden" steht (Mehr → Datei): der erste Schritt
     * heißt „Die Liste", die Liste war aber nicht gerendert, und das Ergebnis war eine
     * vollflächig abgedunkelte Datei-Fläche mit einer Karte darüber — technisch korrekt
     * (der Fallback „kein Ziel, kein Loch" griff), fachlich sinnlos. Gefunden bei der
     * eigenen Browser-Verifikation, nicht von den Tests: die mounten die App bereits auf
     * der Datenfläche und haben den Startweg nie gesehen.
     */
    onStart?: () => void;
    /** Wird genau einmal gerufen, wenn der Rundgang durch ist oder abgebrochen wurde. */
    onDone: () => void;
  }
  const { onStart, onDone }: Props = $props();

  const steps = tourSteps();
  let index = $state(0);
  const step = $derived(steps[index]);
  const istLetzter = $derived(index === steps.length - 1);

  let hole = $state<Box | null>(null);
  let cardPos = $state<{ top: number; left: number } | null>(null);
  let cardEl = $state<HTMLElement | undefined>(undefined);
  let weiterEl = $state<HTMLButtonElement | undefined>(undefined);

  /** Ziel messen und Karte platzieren. Nach jedem Schritt UND bei Größenänderung —
   *  ein Loch, das nach dem Drehen des Geräts woanders sitzt, ist schlimmer als keins. */
  async function messen() {
    await tick();
    const ziel = document.querySelector(`[data-tour="${step.anchor}"]`);
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    hole = ziel ? spotlightHole((ziel as HTMLElement).getBoundingClientRect(), viewport) : null;
    await tick();
    const c = cardEl?.getBoundingClientRect();
    // Von der Bottom-Nav belegter Streifen: gemessen statt geschätzt (sie ist auf dem
    // Gerät um das Home-Indikator-Inset höher als ihr Token-Wert, ADR-v9-189).
    const navRect = document.querySelector('[data-tour="more"]')?.closest('nav')?.getBoundingClientRect();
    cardPos = cardPosition(
      hole,
      viewport,
      { width: c?.width ?? 300, height: c?.height ?? 160 },
      { bottomInset: navRect ? Math.max(0, viewport.height - navRect.top) : 0 },
    );
  }

  function weiter() {
    if (istLetzter) {
      onDone();
      return;
    }
    index += 1;
    void messen();
  }

  function onKeydown(e: KeyboardEvent) {
    // Escape beendet — der Rundgang darf nie das sein, was den Nutzer festhält (LP-8).
    if (e.key === 'Escape') {
      e.preventDefault();
      onDone();
    }
  }

  onMount(() => {
    onStart?.();
    void messen().then(() => weiterEl?.focus());
  });
</script>

<svelte:window onkeydown={onKeydown} onresize={() => void messen()} />

<!-- Beide Teile portaliert (INV-UI-13/§6k): die Schale spannt mit sticky Toolbars und
     scrollenden Panes genug Stacking-/Klipp-Kontexte auf, in denen jede z-index-Zahl
     wirkungslos bliebe (ADR-v9-97). -->
<div
  class="tour__mask"
  class:tour__mask--full={!hole}
  style={hole
    ? `top:${hole.top}px;left:${hole.left}px;width:${hole.width}px;height:${hole.height}px`
    : undefined}
  use:portal
  aria-hidden="true"
></div>

<div
  class="tour__card"
  class:tour__card--center={!cardPos}
  style={cardPos ? `top:${cardPos.top}px;left:${cardPos.left}px` : undefined}
  bind:this={cardEl}
  use:portal
  role="dialog"
  aria-modal="false"
  aria-labelledby="tour-title"
  aria-describedby="tour-text"
>
  <p class="tour__counter">{stepLabel(index, steps.length)}</p>
  <h2 class="tour__title" id="tour-title">{step.title}</h2>
  <p class="tour__text" id="tour-text">{step.text}</p>
  <div class="tour__actions">
    <button type="button" class="stb-btn" data-variant="secondary" onclick={onDone}>Überspringen</button>
    <button type="button" class="stb-btn" data-variant="primary" bind:this={weiterEl} onclick={weiter}>
      {istLetzter ? 'Fertig ✓' : 'Weiter →'}
    </button>
  </div>
</div>

<style>
  /* Das Loch: ein durchsichtiges Rechteck, dessen Schlagschatten den Rest verdunkelt.
     `pointer-events: none` — der Rundgang erklärt, er sperrt nicht. */
  .tour__mask {
    position: fixed;
    border-radius: var(--stb-radius-control);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.66);
    outline: 2px solid var(--stb-gold);
    pointer-events: none;
    z-index: var(--stb-z-modal);
  }

  /* Kein messbares Ziel (Element fehlt oder ist unsichtbar): nur abdunkeln, kein Loch —
     v8s `_obNoSpotlight`-Fall, hier ohne Sonderbehandlung der vier Streifen. */
  .tour__mask--full {
    inset: 0;
    box-shadow: none;
    background: rgba(0, 0, 0, 0.66);
    outline: none;
    border-radius: 0;
  }

  .tour__card {
    position: fixed;
    width: min(20rem, calc(100vw - 2rem));
    padding: 0.9rem 1rem 1rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
    z-index: calc(var(--stb-z-modal) + 1);
  }

  .tour__card--center {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .tour__counter {
    margin: 0 0 0.2rem;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--stb-text-muted);
  }

  .tour__title {
    margin: 0 0 0.35rem;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .tour__text {
    margin: 0 0 0.9rem;
    font-size: 0.85rem;
    line-height: 1.4;
    color: var(--stb-text);
  }

  .tour__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
