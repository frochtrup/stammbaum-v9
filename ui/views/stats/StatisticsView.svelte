<script lang="ts">
  // ui/views/stats/StatisticsView.svelte — Statistik-Lens (Spec 20 §4 "Statistik-Report
  // (Lebensspannen, Heiratsalter, Histogramme)"; Spec 21 §1.1 nennt Statistik als eine der
  // fünf Lenses). Nutzer-Entscheidung für diese Slice: KEIN gemeinsamer Lens-Umschalter —
  // erreichbar ausschließlich über den bestehenden "Mehr"-Hub-Eintrag (MoreView.svelte).
  //
  // Verhaltens-Orakel: legacy-v8/ui-views-stats.js (renderStatsTab). Rendert die Sektionen
  // aus computeStatistics() (stats-model.ts) — einfache CSS-Balken/Fortschrittsanzeigen,
  // kein Chart-Framework (Überkonstruktion für diese Slice). Bar-Breiten/-Höhen laufen über
  // Svelte's kompiliertes style:-Directive (setzt style.setProperty zur Laufzeit, KEIN
  // rohes style="..."-Attribut im markup) — CSP-konform ohne unsafe-inline (LP-8).
  import type { AppState } from '../../shell/app-state.svelte';
  import { computeStatistics, type TopEntry } from './stats-model';

  interface Props {
    appState: AppState;
  }
  const { appState }: Props = $props();

  const stats = $derived(computeStatistics(appState.db, appState.placeContext));

  function fmt(n: number): string {
    return n.toLocaleString('de-DE');
  }

  function barMax(entries: TopEntry[]): number {
    return entries.length ? Math.max(...entries.map((e) => e.count)) : 1;
  }
</script>

<div class="stats-view">
  {#if stats.isEmpty}
    <div class="stats-view__empty">
      <div class="stats-view__empty-icon" aria-hidden="true">📊</div>
      <div>Keine Daten geladen</div>
    </div>
  {:else}
    <section class="stats-section">
      <h2 class="stats-section__title">Übersicht</h2>
      <div class="stats-grid">
        {#each stats.overview as k (k.label)}
          <div class="stats-kachel">
            <div class="stats-kachel__num">{fmt(k.value)}</div>
            <div class="stats-kachel__lbl">{k.label}</div>
          </div>
        {/each}
      </div>
    </section>

    <section class="stats-section">
      <h2 class="stats-section__title">Geschlecht</h2>
      <div class="stats-gender-bar">
        <div
          class="stats-gender-seg stats-gender-seg--m"
          style:--stb-seg-flex={stats.gender.malePct}
          title="Männlich {stats.gender.malePct}%"
        ></div>
        <div
          class="stats-gender-seg stats-gender-seg--f"
          style:--stb-seg-flex={stats.gender.femalePct}
          title="Weiblich {stats.gender.femalePct}%"
        ></div>
        <div
          class="stats-gender-seg stats-gender-seg--u"
          style:--stb-seg-flex={Math.max(stats.gender.unknownPct, 1)}
          title="Unbekannt {stats.gender.unknownPct}%"
        ></div>
      </div>
      <div class="stats-gender-legend">
        <span class="stats-gender-legend__m">♂ {fmt(stats.gender.male)} ({stats.gender.malePct}%)</span>
        <span class="stats-gender-legend__f">♀ {fmt(stats.gender.female)} ({stats.gender.femalePct}%)</span>
        <span class="stats-gender-legend__u">◇ {fmt(stats.gender.unknown)} ({stats.gender.unknownPct}%)</span>
      </div>
    </section>

    <section class="stats-section">
      <h2 class="stats-section__title">Datenvollständigkeit</h2>
      {#each stats.completeness as row (row.label)}
        <div class="stats-progress-row">
          <div class="stats-progress-row__lbl">{row.label}</div>
          <div class="stats-progress-row__track">
            <div class="stats-progress-row__fill" style:--stb-bar-pct={row.pct}></div>
          </div>
          <div class="stats-progress-row__val">{fmt(row.count)} <span class="stats-dim">({row.pct}%)</span></div>
        </div>
      {/each}
    </section>

    {#if stats.lifespans}
      {@const ls = stats.lifespans}
      {@const lsMaxCount = Math.max(...ls.histogram.map((h) => h.count))}
      <section class="stats-section">
        <h2 class="stats-section__title">Lebensspannen ({ls.count} Personen)</h2>
        <div class="stats-summary">
          <div class="stats-summary__item"><div class="stats-summary__val">{ls.avg}</div><div class="stats-summary__lbl">Ø Jahre</div></div>
          <div class="stats-summary__item"><div class="stats-summary__val">{ls.median}</div><div class="stats-summary__lbl">Median</div></div>
          <div class="stats-summary__item"><div class="stats-summary__val">{ls.min}</div><div class="stats-summary__lbl">Min</div></div>
          <div class="stats-summary__item"><div class="stats-summary__val">{ls.max}</div><div class="stats-summary__lbl">Max</div></div>
        </div>
        <div class="stats-timeline">
          {#each ls.histogram as h (h.bin)}
            <div class="stats-tl-item">
              <div class="stats-tl-bar-wrap">
                <div class="stats-tl-bar stats-tl-bar--ls" style:--stb-bar-h={Math.round((h.count / lsMaxCount) * 80)} title={String(h.count)}></div>
              </div>
              <div class="stats-tl-lbl">{h.bin}–{h.bin + 9}</div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if stats.marriageAges}
      {@const ma = stats.marriageAges}
      {@const maMaxCount = Math.max(...ma.bins.map((b) => b.male + b.female))}
      <section class="stats-section">
        <h2 class="stats-section__title">Heiratsalter</h2>
        <div class="stats-summary">
          <div class="stats-summary__item"><div class="stats-summary__val">{ma.avgMale ?? '–'}</div><div class="stats-summary__lbl stats-summary__lbl--m">Ø Mann</div></div>
          <div class="stats-summary__item"><div class="stats-summary__val">{ma.avgFemale ?? '–'}</div><div class="stats-summary__lbl stats-summary__lbl--f">Ø Frau</div></div>
          <div class="stats-summary__item"><div class="stats-summary__val">{ma.count}</div><div class="stats-summary__lbl">Datenpunkte</div></div>
        </div>
        <div class="stats-timeline">
          {#each ma.bins as b (b.bin)}
            <div class="stats-tl-item">
              <div class="stats-tl-bar-wrap stats-tl-bar-wrap--dual">
                <div class="stats-tl-bar stats-tl-bar--marr-m" style:--stb-bar-h={Math.round((b.male / maMaxCount) * 72)} title="♂ {b.male}"></div>
                <div class="stats-tl-bar stats-tl-bar--marr-f" style:--stb-bar-h={Math.round((b.female / maMaxCount) * 72)} title="♀ {b.female}"></div>
              </div>
              <div class="stats-tl-lbl">{b.bin}–{b.bin + 4}</div>
            </div>
          {/each}
        </div>
        <div class="stats-legend">
          <span class="stats-legend__dot stats-legend__dot--m"></span><span>♂ Männer</span>
          <span class="stats-legend__dot stats-legend__dot--f"></span><span>♀ Frauen</span>
        </div>
      </section>
    {/if}

    {#if stats.decadeEvents}
      {@const dec = stats.decadeEvents}
      {@const decMaxCount = Math.max(...dec.decades.map((d) => Math.max(dec.births[d] ?? 0, dec.deaths[d] ?? 0, dec.marriages[d] ?? 0)))}
      <section class="stats-section">
        <h2 class="stats-section__title">Ereignisse pro Jahrzehnt</h2>
        <div class="stats-timeline stats-timeline--dec">
          {#each dec.decades as d (d)}
            {@const b = dec.births[d] ?? 0}
            {@const dt = dec.deaths[d] ?? 0}
            {@const m = dec.marriages[d] ?? 0}
            <div class="stats-tl-item">
              <div class="stats-tl-bar-wrap stats-tl-bar-wrap--tri">
                <div class="stats-tl-bar stats-tl-bar--birth" style:--stb-bar-h={Math.round((b / decMaxCount) * 72)} title="Geburten {b}"></div>
                <div class="stats-tl-bar stats-tl-bar--death" style:--stb-bar-h={Math.round((dt / decMaxCount) * 72)} title="Sterbefälle {dt}"></div>
                <div class="stats-tl-bar stats-tl-bar--marr" style:--stb-bar-h={Math.round((m / decMaxCount) * 72)} title="Heiraten {m}"></div>
              </div>
              <div class="stats-tl-lbl">{d}er</div>
            </div>
          {/each}
        </div>
        <div class="stats-legend">
          <span class="stats-legend__dot stats-legend__dot--birth"></span><span>Geburten</span>
          <span class="stats-legend__dot stats-legend__dot--death"></span><span>Sterbefälle</span>
          <span class="stats-legend__dot stats-legend__dot--marr"></span><span>Heiraten</span>
        </div>
      </section>
    {/if}

    {#if stats.childCounts.length > 0}
      {@const childMaxCount = Math.max(...stats.childCounts.map((c) => c.count))}
      <section class="stats-section">
        <h2 class="stats-section__title">Kinderzahl pro Familie</h2>
        <div class="stats-timeline stats-timeline--child">
          {#each stats.childCounts as c (c.label)}
            <div class="stats-tl-item">
              <div class="stats-tl-bar-wrap">
                <div class="stats-tl-bar stats-tl-bar--child" style:--stb-bar-h={Math.round((c.count / childMaxCount) * 80)} title={String(c.count)}></div>
              </div>
              <div class="stats-tl-lbl">{c.label}</div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if stats.topSurnames.length > 0}
      <section class="stats-section">
        <h2 class="stats-section__title">Häufigste Nachnamen</h2>
        {#each stats.topSurnames as entry (entry.label)}
          <div class="stats-bar-row">
            <div class="stats-bar-row__lbl" title={entry.label}>{entry.label}</div>
            <div class="stats-bar-row__track">
              <div class="stats-bar-row__fill" style:--stb-bar-pct={Math.round((entry.count / barMax(stats.topSurnames)) * 100)}></div>
            </div>
            <div class="stats-bar-row__cnt">{entry.count}</div>
          </div>
        {/each}
      </section>
    {/if}

    {#if stats.topGivenNames.length > 0}
      <section class="stats-section">
        <h2 class="stats-section__title">Häufigste Vornamen</h2>
        {#each stats.topGivenNames as entry (entry.label)}
          <div class="stats-bar-row">
            <div class="stats-bar-row__lbl" title={entry.label}>{entry.label}</div>
            <div class="stats-bar-row__track">
              <div class="stats-bar-row__fill stats-bar-row__fill--blue" style:--stb-bar-pct={Math.round((entry.count / barMax(stats.topGivenNames)) * 100)}></div>
            </div>
            <div class="stats-bar-row__cnt">{entry.count}</div>
          </div>
        {/each}
      </section>
    {/if}

    {#if stats.topBirthPlaces.length > 0}
      <section class="stats-section">
        <h2 class="stats-section__title">Häufigste Geburtsorte</h2>
        {#each stats.topBirthPlaces as entry (entry.label)}
          <div class="stats-bar-row">
            <div class="stats-bar-row__lbl" title={entry.label}>{entry.label}</div>
            <div class="stats-bar-row__track">
              <div class="stats-bar-row__fill stats-bar-row__fill--dim" style:--stb-bar-pct={Math.round((entry.count / barMax(stats.topBirthPlaces)) * 100)}></div>
            </div>
            <div class="stats-bar-row__cnt">{entry.count}</div>
          </div>
        {/each}
      </section>
    {/if}

    {#if stats.topDeathPlaces.length > 0}
      <section class="stats-section">
        <h2 class="stats-section__title">Häufigste Sterbeorte</h2>
        {#each stats.topDeathPlaces as entry (entry.label)}
          <div class="stats-bar-row">
            <div class="stats-bar-row__lbl" title={entry.label}>{entry.label}</div>
            <div class="stats-bar-row__track">
              <div class="stats-bar-row__fill stats-bar-row__fill--dim" style:--stb-bar-pct={Math.round((entry.count / barMax(stats.topDeathPlaces)) * 100)}></div>
            </div>
            <div class="stats-bar-row__cnt">{entry.count}</div>
          </div>
        {/each}
      </section>
    {/if}

    {#if stats.fallbackTimeline}
      {@const fb = stats.fallbackTimeline}
      {@const fbMaxCount = Math.max(...fb.bins.map((b) => b.count))}
      <section class="stats-section">
        <h2 class="stats-section__title">Zeitliche Verteilung (Geburten)</h2>
        <div class="stats-timeline">
          {#each fb.bins as bin (bin.bin)}
            <div class="stats-tl-item">
              <div class="stats-tl-bar-wrap">
                <div class="stats-tl-bar" style:--stb-bar-h={Math.round((bin.count / fbMaxCount) * 80)} title={String(bin.count)}></div>
              </div>
              <div class="stats-tl-lbl">{bin.bin}er</div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .stats-view {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.75rem;
    overflow-y: auto;
    height: 100%;
  }

  .stats-view__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 3rem 1rem;
    color: var(--stb-text-dim);
  }

  .stats-view__empty-icon {
    font-size: 2.5rem;
  }

  .stats-section {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
    padding: 0.85rem 1rem;
  }

  .stats-section__title {
    margin: 0 0 0.6rem;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  /* Übersicht-Kacheln */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 0.5rem;
  }

  .stats-kachel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    background: var(--stb-surface-2);
    border-radius: var(--stb-radius-control);
    padding: 0.6rem 0.4rem;
  }

  .stats-kachel__num {
    font-family: var(--stb-font-title);
    font-size: 1.3rem;
    color: var(--stb-gold);
  }

  .stats-kachel__lbl {
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }

  /* Geschlechterverteilung */
  .stats-gender-bar {
    display: flex;
    height: 14px;
    border-radius: 7px;
    overflow: hidden;
  }

  .stats-gender-seg {
    flex: var(--stb-seg-flex, 1);
  }

  .stats-gender-seg--m {
    background: #4a80c8;
  }

  .stats-gender-seg--f {
    background: #c84a92;
  }

  .stats-gender-seg--u {
    background: var(--stb-surface-3);
  }

  .stats-gender-legend {
    display: flex;
    gap: 1rem;
    margin-top: 0.5rem;
    font-size: 0.85rem;
    flex-wrap: wrap;
  }

  .stats-gender-legend__m {
    color: #4a80c8;
  }

  .stats-gender-legend__f {
    color: #c84a92;
  }

  .stats-gender-legend__u {
    color: var(--stb-text-dim);
  }

  /* Datenvollständigkeit */
  .stats-progress-row {
    display: grid;
    grid-template-columns: 9rem 1fr auto;
    align-items: center;
    gap: 0.6rem;
    margin: 0.35rem 0;
    font-size: 0.85rem;
  }

  .stats-progress-row__lbl {
    color: var(--stb-text-dim);
  }

  .stats-progress-row__track {
    height: 8px;
    background: var(--stb-surface-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .stats-progress-row__fill {
    width: calc(var(--stb-bar-pct, 0) * 1%);
    height: 100%;
    background: var(--stb-gold-dim);
  }

  .stats-progress-row__val {
    white-space: nowrap;
    text-align: right;
  }

  .stats-dim {
    color: var(--stb-text-dim);
  }

  /* Kennzahlen-Zusammenfassung (Lebensspannen/Heiratsalter) */
  .stats-summary {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.6rem;
    flex-wrap: wrap;
  }

  .stats-summary__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--stb-surface-2);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem 0.9rem;
    min-width: 4.5rem;
  }

  .stats-summary__val {
    font-family: var(--stb-font-title);
    font-size: 1.2rem;
    color: var(--stb-gold);
  }

  .stats-summary__lbl {
    font-size: 0.7rem;
    color: var(--stb-text-dim);
  }

  .stats-summary__lbl--m {
    color: #4a80c8;
  }

  .stats-summary__lbl--f {
    color: #c84a92;
  }

  /* Histogramme */
  .stats-timeline {
    display: flex;
    align-items: flex-end;
    gap: 0.4rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }

  .stats-tl-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 2.4rem;
  }

  .stats-tl-bar-wrap {
    display: flex;
    align-items: flex-end;
    height: 80px;
  }

  .stats-tl-bar-wrap--dual,
  .stats-tl-bar-wrap--tri {
    gap: 2px;
  }

  .stats-tl-bar {
    width: 14px;
    height: calc(var(--stb-bar-h, 0) * 1px);
    background: var(--stb-gold-dim);
    border-radius: 2px 2px 0 0;
  }

  .stats-tl-bar--ls {
    background: var(--stb-gold-dim);
  }

  .stats-tl-bar--marr-m {
    background: #4a80c8;
  }

  .stats-tl-bar--marr-f {
    background: #c84a92;
  }

  .stats-tl-bar--birth {
    background: var(--stb-gold-dim);
  }

  .stats-tl-bar--death {
    background: var(--stb-text-dim);
  }

  .stats-tl-bar--marr {
    background: #4ac86e;
  }

  .stats-tl-bar--child {
    background: var(--stb-gold);
  }

  .stats-tl-lbl {
    font-size: 0.65rem;
    color: var(--stb-text-dim);
    white-space: nowrap;
  }

  .stats-legend {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--stb-text-dim);
    flex-wrap: wrap;
  }

  .stats-legend__dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
  }

  .stats-legend__dot--m {
    background: #4a80c8;
  }

  .stats-legend__dot--f {
    background: #c84a92;
  }

  .stats-legend__dot--birth {
    background: var(--stb-gold-dim);
  }

  .stats-legend__dot--death {
    background: var(--stb-text-dim);
  }

  .stats-legend__dot--marr {
    background: #4ac86e;
  }

  /* Top-Listen (horizontale Balken) */
  .stats-bar-row {
    display: grid;
    grid-template-columns: 8rem 1fr 2rem;
    align-items: center;
    gap: 0.5rem;
    margin: 0.3rem 0;
    font-size: 0.85rem;
  }

  .stats-bar-row__lbl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stats-bar-row__track {
    height: 8px;
    background: var(--stb-surface-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .stats-bar-row__fill {
    width: calc(var(--stb-bar-pct, 0) * 1%);
    height: 100%;
    background: var(--stb-gold-dim);
  }

  .stats-bar-row__fill--blue {
    background: #4a80c8;
  }

  .stats-bar-row__fill--dim {
    background: var(--stb-text-dim);
  }

  .stats-bar-row__cnt {
    text-align: right;
    color: var(--stb-text-dim);
  }
</style>
