<script lang="ts">
  // ui/views/story/StoryLensView.svelte — Story-Lens (Spec 21 §4, Spec 20 §1.10 [E]).
  // Dünne reaktive Schale um den reinen Story-Aufbau (ui/views/story/story-model.ts):
  // wählt die Bezugsperson (geteilter Lens-Fokus `lensFocus`, sonst der Proband — wie
  // Baum/Karte/Zeitleiste seit BL-120/ADR-v9-135) und rendert das strukturierte StoryDoc
  // als zugängliches Markup (kein {@html} — die Absätze sind reiner Text, Svelte escapet).
  //
  // Zwei Modi (BL-186): Person-Biografie und couple-zentrische Familien-Biografie. Der
  // Umschalter ist ein ViewModeToggle (INV-UI-11 „Alternativansicht-Umschalter"), sein
  // Modus lebt in `route.storyMode` (überlebt das Wegnavigieren wie treeMode/timelineMode).
  // Familien-Modus: die per Familien-Detail-📖 gesetzte `storyFamily`, sonst die erste
  // Ehefamilie der Fokus-Person.
  //
  // INV-UI-4: Kopfzeile kommt AUSSCHLIESSLICH aus LensViewHeader. Personen-Auswahl über
  // den geteilten Entitäten-Picker, identisch zu MapLensView/TimelineLensView.
  //
  // Karte (BL-187), Inline-Diagramm (BL-188), Fotos (BL-189) und Download (BL-190) hängen
  // sich hier in Folge-Bauabschnitten ein.
  import LensViewHeader from '../../shell/LensViewHeader.svelte';
  import PersonPicker from '../../shell/PersonPicker.svelte';
  import ViewModeToggle from '../../shell/ViewModeToggle.svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import type { Route } from '../../shell/route.svelte';
  import type { LensId } from '../../shell/lens-model';
  import { resolveProband } from '../../shell/proband';
  import { displayName } from '../../shell/person-display';
  import { mountStoryMap } from '../../islands/story/story-map-svg';
  import { mountStoryDiagram } from '../../islands/story/story-diagram';
  import { buildStoryHtml } from './story-to-html';
  import { openReportInNewTab } from '../reports/open-report';
  import { buildPersonStory, buildFamilyStory, type StoryDoc } from './story-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    route: Route;
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, route, onNavigateLens }: Props = $props();

  const MODES = [
    { id: 'person', label: 'Person' },
    { id: 'family', label: 'Familie' },
  ];

  // Bezugsperson: geteilter Fokus, sonst Proband (EINE Default-Quelle, ADR-v9-140).
  const focusId = $derived(viewState.getCurrent('lensFocus') ?? resolveProband(appState.db, viewState));
  const subject = $derived(focusId ? (appState.db.individuals.get(focusId) ?? null) : null);

  // Familie im Familien-Modus: explizit gewählte (Familien-Detail-Einstieg) oder die erste
  // Ehefamilie der Fokus-Person.
  const familyId = $derived(viewState.getCurrent('storyFamily') ?? subject?.parentIn[0] ?? null);

  const doc = $derived<StoryDoc | null>(
    route.storyMode === 'family'
      ? familyId && appState.db.families.get(familyId)
        ? buildFamilyStory(appState.db, familyId)
        : null
      : subject
        ? buildPersonStory(appState.db, appState.placeContext, subject.id)
        : null,
  );

  // Lebensweg-Karte als inline-SVG (BL-187) — EIN Renderweg für Live-Lens und Download,
  // offline-tauglich (kein Kachel-Fetch). Der volle interaktive Pan/Zoom bleibt der
  // kanonischen Karte-Lens vorbehalten (INV-UI-3), erreichbar über „🗺 In Karte öffnen".
  const mapPoints = $derived(doc?.mapPoints ?? []);

  // Container der Karte; die SVG-Insel wird imperativ eingehängt (Spec 02 §5) — die
  // DOM-Berührung lebt in der .ts-Insel (mountStoryMap), nicht hier. Neu bei Änderung.
  let mapHost = $state<HTMLDivElement>();
  $effect(() => {
    if (mapHost) mountStoryMap(mapHost, mapPoints);
  });

  // Inline-Diagramm (BL-188), ebenfalls Insel-Muster. Klick auf eine Karte re-zentriert
  // die Story auf diese Person (bleibt in der Lens; kein neuer App-Callback nötig).
  let diagramHost = $state<HTMLDivElement>();
  $effect(() => {
    const el = diagramHost;
    if (!el || !doc) return;
    mountStoryDiagram(el, appState.db, { subject: doc.subject, id: doc.id }, (id) => {
      viewState.setCurrent('lensFocus', id);
      viewState.setCurrent('storyFamily', null);
      route.setStoryMode('person');
    });
  });

  // Download als selbst-enthaltenes, druckbares HTML (BL-190): reine Renderfunktion über
  // das aktuelle StoryDoc → neuer Tab (Nutzer druckt/sichert als PDF), Download-Fallback
  // bei blockiertem Popup — dieselbe Mechanik wie die §4-Ausgaben (open-report.ts).
  function downloadStory(): void {
    if (!doc) return;
    const on = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
    openReportInNewTab(buildStoryHtml(appState.db, doc, on), `${doc.title}.html`);
  }

  let pickerOpen = $state(false);
  function pick(id: string | null): void {
    if (id) {
      viewState.setCurrent('lensFocus', id);
      // Familien-Fokus fallenlassen, damit der Familien-Modus der neuen Person folgt.
      viewState.setCurrent('storyFamily', null);
    }
    // Schließen übernimmt der Picker selbst via onClose.
  }
</script>

<div class="story-lens-view">
  <LensViewHeader active="story" onNavigate={(lens) => onNavigateLens?.(lens)} />

  <div class="story-lens-view__mode-row">
    <ViewModeToggle
      modes={MODES}
      value={route.storyMode}
      onChange={(id) => route.setStoryMode(id as 'person' | 'family')}
      ariaLabel="Story-Modus wählen"
    />
  </div>

  <div class="story-lens-view__subject-row">
    <!-- Im Familien-Modus benennt die H1 bereits das Paar; die (evtl. abweichende)
         Fokus-Person hier zu zeigen wäre irreführend. Der Picker bleibt in beiden Modi:
         eine Person zu wählen leitet im Familien-Modus deren Ehefamilie ab. -->
    {#if subject && route.storyMode === 'person'}
      <span class="story-lens-view__subject">{displayName(subject)}</span>
    {/if}
    <button
      type="button"
      class="story-lens-view__pick"
      aria-label="Andere Person wählen"
      onclick={() => (pickerOpen = true)}
    >
      ⊕ Person wählen
    </button>
    {#if doc}
      <button type="button" class="story-lens-view__pick" onclick={downloadStory}>
        ↓ Download
      </button>
    {/if}
  </div>

  {#if pickerOpen}
    <div class="story-lens-view__picker-slot">
      <PersonPicker
        {appState}
        value={focusId}
        onChange={pick}
        onClose={() => (pickerOpen = false)}
        allowCreate={false}
        startOpen
        label="Bezugsperson der Story wählen"
      />
    </div>
  {/if}

  {#if !doc}
    <p class="story-lens-view__empty">
      {route.storyMode === 'family' ? 'Keine Familie für diese Person.' : 'Keine Person geladen.'}
    </p>
  {:else}
    <article class="story-lens-view__article">
      <header class="story-lens-view__head">
        <h1 class="story-lens-view__name">{doc.title}</h1>
        {#if doc.subtitle}
          <p class="story-lens-view__subtitle">{doc.subtitle}</p>
        {/if}
        {#if doc.lifespan}
          <p class="story-lens-view__lifespan">{doc.lifespan}</p>
        {/if}
      </header>

      {#if doc.photos.length}
        <div class="story-lens-view__photos">
          {#each doc.photos as photo, pi (pi)}
            <img class="story-lens-view__photo" src={photo.src} alt={photo.title} loading="lazy" />
          {/each}
        </div>
      {/if}

      {#if mapPoints.length}
        <section class="story-lens-view__section story-lens-view__map">
          <!-- Insel-Muster (Spec 02 §5): die Schale stellt einen Container, der reine
               SVG-String wird imperativ eingehängt — kein {@html} in der Komponente. -->
          <div class="story-lens-view__map-host" bind:this={mapHost}></div>
          <button type="button" class="story-lens-view__map-link" onclick={() => onNavigateLens?.('map')}>
            🗺 In Karte öffnen
          </button>
        </section>
      {/if}

      <section class="story-lens-view__section story-lens-view__diagram">
        <div bind:this={diagramHost}></div>
      </section>

      {#each doc.sections as section (section.id)}
        <section class="story-lens-view__section">
          {#if section.heading}
            <h2 class="story-lens-view__section-title">{section.heading}</h2>
          {/if}
          {#each section.paragraphs as para, i (i)}
            <p class="story-lens-view__para">{para}</p>
          {/each}
          {#if section.blocks}
            {#each section.blocks as block, bi (bi)}
              <div class="story-lens-view__block">
                <h3 class="story-lens-view__block-title">{block.subheading}</h3>
                {#each block.paragraphs as bpara, bpi (bpi)}
                  <p class="story-lens-view__para">{bpara}</p>
                {/each}
              </div>
            {/each}
          {/if}
        </section>
      {/each}
    </article>
  {/if}
</div>

<style>
  .story-lens-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .story-lens-view__mode-row {
    padding: 0.5rem 0.75rem 0;
  }

  .story-lens-view__subject-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem 0;
  }

  .story-lens-view__subject {
    font-weight: 600;
    color: var(--stb-text);
  }

  .story-lens-view__pick {
    background: var(--stb-surface-2);
    border: 1px dashed var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.25rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .story-lens-view__picker-slot {
    padding: 0.5rem 0.75rem 0;
  }

  .story-lens-view__empty {
    padding: 1rem 0.75rem;
    color: var(--stb-text-dim);
  }

  /* Lesefluss: eine schmale Textspalte, serifenlos wie der Rest der App (der Druck-
     Download bringt seine eigene Serifen-Typografie mit, BL-190). */
  .story-lens-view__article {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.75rem;
    max-width: 46rem;
    line-height: 1.6;
  }

  .story-lens-view__name {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--stb-text);
  }

  .story-lens-view__subtitle {
    color: var(--stb-gold);
    margin-top: 0.15rem;
  }

  .story-lens-view__lifespan {
    color: var(--stb-text-dim);
    margin-top: 0.15rem;
  }

  .story-lens-view__section {
    margin-top: 1.1rem;
  }

  .story-lens-view__photos {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .story-lens-view__photo {
    max-height: 11rem;
    max-width: 100%;
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    object-fit: cover;
  }

  .story-lens-view__map {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: flex-start;
  }

  .story-lens-view__map-link {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-gold-light);
    border-radius: var(--stb-radius-control);
    padding: 0.25rem 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .story-lens-view__section-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--stb-gold);
    border-bottom: 1px solid var(--stb-surface-3);
    padding-bottom: 0.2rem;
    margin-bottom: 0.5rem;
  }

  .story-lens-view__block {
    margin-top: 0.7rem;
  }

  .story-lens-view__block-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--stb-text);
  }

  .story-lens-view__para {
    margin-top: 0.5rem;
    color: var(--stb-text);
  }
</style>
