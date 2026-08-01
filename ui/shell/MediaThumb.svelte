<script lang="ts">
  // ui/shell/MediaThumb.svelte — die EINE Bild-Primitive der Medien-Anzeige
  // (Spec 21 §10n, ADR-v9-187). Sie wird an fünf Stellen gebraucht (Galerie-Kachel,
  // Medium-Detail, Steckbrief-Porträt, Ereigniszeile, Ausgaben-Vorlauf) — und genau
  // deshalb darf keine dieser Stellen selbst entscheiden, was anzeigbar ist.
  //
  // Vier sichtbare Zustände, keiner davon ein leeres Kästchen:
  //   Bild        — Vorschau aus dem Medien-Ordner oder eingebettet
  //   Dokument    — 📄 (PDF & Co.; am Realbestand 30 Stück), kein totes <img>
  //   Weblink     — ↗ mit Host; wird VERLINKT, nie geladen (LP-2/CSP)
  //   unauffindbar— ⚠ mit Dateiname bzw. Hinweis auf den fehlenden Ordner
  //
  // „Nicht auffindbar" ist ein Zustand, kein Fehler: ohne verbundenen Ordner ist er der
  // Normalfall, und die Kachel muss trotzdem lesbar bleiben.
  import { classifyMediaFile, isImageMedia, webLinkHost } from '../../core/model/media-kind';
  import type { MediaResolver, ResolvedMedia } from '../../services/media';

  interface Props {
    file: string;
    /** Kanonisches MIME (`Media.form`) — entscheidet Bild ⇄ Dokument. */
    form?: string;
    /** Alternativtext des Bildes; leer lassen, wenn der Titel daneben steht (dekorativ). */
    alt?: string;
    /** Ohne Resolver bleibt es bei Klassifikation + eingebetteten Bildern. */
    resolver?: MediaResolver;
    /** Zählt hoch, wenn der Ordner gewechselt hat — erzwingt ein Neu-Auflösen. */
    resolveKey?: number;
    size?: 'tile' | 'inline' | 'large';
  }
  const { file, form = '', alt = '', resolver, resolveKey = 0, size = 'tile' }: Props = $props();

  const kind = $derived(classifyMediaFile(file));
  const isImage = $derived(isImageMedia(file, form));

  let resolved = $state<ResolvedMedia | null>(null);

  // Auflösung ist asynchron (Dateizugriff); die Klassifikation darüber ist es nicht.
  // Der Wächter gegen ein veraltetes Ergebnis ist die `token`-Prüfung: wechselt `file`
  // während des Lesens, darf das alte Ergebnis nicht mehr einschlagen.
  let token = 0;
  $effect(() => {
    const myFile = file;
    void resolveKey;
    const my = ++token;
    resolved = null;
    if (!resolver) return;
    // Kacheln bekommen die VERKLEINERTE Fassung, die große Vorschau das Original. Ohne
    // diese Unterscheidung wäre `resolveThumbnail` gebaut, aber nie aufgerufen — und die
    // 126 unkomprimierten BMP des Bestands landeten trotzdem in Originalgröße im Raster.
    const load = size === 'large' ? resolver.resolve(myFile) : resolver.resolveThumbnail(myFile);
    void load
      .then((r) => {
        if (my === token) resolved = r;
      })
      .catch(() => {
        if (my === token) resolved = { state: 'missing', url: '', match: null };
      });
  });

  const src = $derived(resolved?.state === 'ok' ? resolved.url : '');
  const viaBasename = $derived(resolved?.match === 'basename');
  // NUR „Ordner verbunden, Datei nicht darin" ist ein ⚠. „Kein Ordner verbunden" ist
  // KEIN Befund über die Datei — sie existiert vermutlich, wir kommen nur nicht heran.
  // (Beim ersten Bau lief `no-folder` mit in diesen Zweig: die Galerie zeigte am
  // Realbestand 189 Warnungen, obwohl über keine einzige Datei etwas bekannt war.
  // Eigene Browser-Verifikation, nicht der Test — der kannte nur den verbundenen Fall.)
  const missing = $derived(kind === 'file' && resolved?.state === 'missing');
  const host = $derived(kind === 'weblink' ? webLinkHost(file) : '');
</script>

{#if kind === 'weblink'}
  <span class="media-thumb media-thumb--link" title={file}>↗ {host || 'Weblink'}</span>
{:else if kind === 'empty'}
  <span class="media-thumb media-thumb--warn" title="Kein Dateiverweis">⚠</span>
{:else if src && isImage}
  <span class="media-thumb media-thumb--img" class:media-thumb--tile={size === 'tile'} class:media-thumb--large={size === 'large'}>
    <img {src} {alt} loading="lazy" />
    {#if viaBasename}
      <span
        class="media-thumb__fuzzy"
        title="Nur über den Dateinamen zugeordnet — der Ordner im Verweis weicht ab."
        aria-label="Zuordnung unsicher">≈</span
      >
    {/if}
  </span>
{:else if !isImage}
  <span class="media-thumb media-thumb--doc" title={file}>📄</span>
{:else if missing}
  <span class="media-thumb media-thumb--warn" title="Datei im Medien-Ordner nicht gefunden: {file}">⚠</span>
{:else}
  <!-- Kein Ordner verbunden (oder noch am Lesen): kein Platzhalter-Rahmen, damit die
       Kachel nicht dauerhaft nach „kaputt" aussieht. -->
  <span class="media-thumb media-thumb--pending" aria-hidden="true"></span>
{/if}

<style>
  .media-thumb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .media-thumb--link,
  .media-thumb--doc,
  .media-thumb--warn {
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }

  .media-thumb--warn {
    color: var(--stb-warn, #d9a400);
  }

  .media-thumb--img {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: calc(var(--stb-radius-control) - 2px);
    background: var(--stb-surface-3);
  }

  .media-thumb--img img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .media-thumb--tile {
    width: 100%;
    aspect-ratio: 4 / 3;
  }

  .media-thumb--large {
    max-height: 22rem;
  }

  .media-thumb--large img {
    height: auto;
    object-fit: contain;
  }

  .media-thumb__fuzzy {
    position: absolute;
    right: 0.2rem;
    bottom: 0.2rem;
    font-size: 0.7rem;
    line-height: 1;
    padding: 0.1rem 0.25rem;
    border-radius: 6px;
    background: var(--stb-surface-1);
    color: var(--stb-warn, #d9a400);
  }

  .media-thumb--pending {
    display: none;
  }
</style>
