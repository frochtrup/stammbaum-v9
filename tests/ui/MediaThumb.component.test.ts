// @vitest-environment happy-dom
// tests/ui/MediaThumb.component.test.ts — BL-258/ADR-v9-187, Spec 21 §10n: die EINE
// Bild-Primitive. Sie trägt vier sichtbare Zustände, und keiner davon ist ein leeres
// Kästchen — genau das war der Mangel, den ADR-v9-136 hinterließ: ein Pfad-Bild sah aus
// wie ein Medium ohne Inhalt, obwohl die Datei existierte.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import MediaThumb from '../../ui/shell/MediaThumb.svelte';
import { createMediaResolver } from '../../services/media/media-resolver';
import type { MediaFolderAdapter, MediaFolderEntry } from '../../services/media/types';

function adapter(paths: string[], over: Partial<MediaFolderAdapter> = {}): MediaFolderAdapter {
  const entries: MediaFolderEntry[] = paths.map((p) => ({ path: p, name: p.split('/').pop() ?? p, handle: {} }));
  return {
    isSupported: () => true,
    pick: async () => ({ name: 'Genealogie' }),
    requestPermission: async () => true,
    nameOf: () => 'Genealogie',
    listFiles: async () => entries,
    readFile: async () => new Blob(['bytes']),
    ...over,
  };
}

function memStore() {
  let v: unknown = null;
  return { load: async () => v, save: async (h: unknown) => { v = h; }, clear: async () => { v = null; } };
}

async function connected(paths: string[], over: Partial<MediaFolderAdapter> = {}) {
  let n = 0;
  const r = createMediaResolver({
    adapter: adapter(paths, over),
    store: memStore(),
    createObjectUrl: () => `blob:fake/${++n}`,
    revokeObjectUrl: () => {},
  });
  await r.connect();
  return r;
}

describe('MediaThumb — die vier Zustände', () => {
  it('Weblink: ↗ mit Host, KEIN <img> (LP-2/CSP)', () => {
    const { container } = render(MediaThumb, {
      props: { file: 'https://data.matricula-online.eu/de/x/' },
    });
    expect(screen.getByText(/data\.matricula-online\.eu/)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('Dokument: 📄 statt eines toten Bildsymbols', async () => {
    const r = await connected(['Documents/Urkunde.pdf']);
    const { container } = render(MediaThumb, {
      props: { file: 'Documents/Urkunde.pdf', form: 'application/pdf', resolver: r },
    });
    expect(screen.getByText('📄')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('Bild aus dem verbundenen Ordner: ein <img> mit Objekt-URL', async () => {
    const r = await connected(['Pictures/bardel.jpg']);
    const { container } = render(MediaThumb, {
      props: { file: 'Pictures/bardel.jpg', form: 'image/jpeg', resolver: r },
    });
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('img')!.getAttribute('src')).toMatch(/^blob:/);
  });

  it('eingebettetes Bild braucht keinen Ordner', async () => {
    const { container } = render(MediaThumb, { props: { file: 'data:image/png;base64,AA' } });
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
    // Ohne Resolver bleibt es beim Metadaten-Zustand; MIT Resolver erscheint das Bild.
    const r = await connected([]);
    const view = render(MediaThumb, { props: { file: 'data:image/png;base64,AA', resolver: r } });
    await waitFor(() => expect(view.container.querySelector('img')).not.toBeNull());
    expect(view.container.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,AA');
  });

  it('nicht auffindbar: ⚠ mit dem Dateinamen im Tooltip — kein leeres Kästchen', async () => {
    const r = await connected(['Pictures/andere.jpg']);
    render(MediaThumb, { props: { file: 'Pictures/weg.jpg', form: 'image/jpeg', resolver: r } });
    await waitFor(() => expect(screen.getByText('⚠')).toBeTruthy());
    expect(screen.getByText('⚠').getAttribute('title')).toContain('Pictures/weg.jpg');
  });

  it('OHNE verbundenen Ordner ist ein Pfad-Bild KEIN ⚠ — wir wissen nichts über die Datei', async () => {
    // Der Befund der eigenen Browser-Verifikation: die erste Fassung warf `no-folder` mit
    // `missing` in einen Topf und zeigte am Realbestand 189 Warnungen, ohne dass über
    // eine einzige Datei etwas bekannt gewesen wäre. Eine Warnung, die immer leuchtet,
    // ist keine Warnung.
    let n = 0;
    const r = createMediaResolver({
      adapter: adapter([]),
      store: memStore(),
      createObjectUrl: () => `blob:fake/${++n}`,
      revokeObjectUrl: () => {},
    });
    // BEWUSST nicht verbunden.
    render(MediaThumb, { props: { file: 'Pictures/bardel.jpg', form: 'image/jpeg', resolver: r } });
    await waitFor(() => expect(screen.queryByText('⚠')).toBeNull());
  });
});

describe('MediaThumb — die unscharfe Zuordnung ist sichtbar', () => {
  it('markiert einen Treffer, der nur über den Dateinamen zustande kam', async () => {
    const r = await connected(['Fotos/marianne.jpg']);
    render(MediaThumb, { props: { file: 'Pictures/marianne.jpg', form: 'image/jpeg', resolver: r } });
    await waitFor(() => expect(screen.getByLabelText('Zuordnung unsicher')).toBeTruthy());
  });

  it('markiert einen exakten Treffer NICHT', async () => {
    const r = await connected(['Pictures/marianne.jpg']);
    render(MediaThumb, { props: { file: 'Pictures/marianne.jpg', form: 'image/jpeg', resolver: r } });
    await waitFor(() => expect(screen.queryByLabelText('Zuordnung unsicher')).toBeNull());
  });
});

describe('WÄCHTER: kein Pfad wird nach Media.file zurückgeschrieben (LP-1)', () => {
  it('die Anzeige verändert den übergebenen Dateiwert nicht', async () => {
    // Der unscharfe Fall ist der verführerische: die App WEISS jetzt, dass die Datei in
    // Wahrheit `Fotos/marianne.jpg` heißt. Sie darf es trotzdem nicht eintragen — die
    // Datei gehört dem Nutzer, und ein stiller Pfad-Umschrieb bräche den Roundtrip.
    const r = await connected(['Fotos/marianne.jpg']);
    const props = { file: 'Pictures/marianne.jpg', form: 'image/jpeg', resolver: r };
    render(MediaThumb, { props });
    await waitFor(() => expect(screen.getByLabelText('Zuordnung unsicher')).toBeTruthy());
    expect(props.file).toBe('Pictures/marianne.jpg');
  });
});

describe('MediaThumb — Verkleinerung', () => {
  it('fragt für Kacheln die verkleinerte Fassung an, wenn die Plattform sie kann', async () => {
    const makeThumbnail = vi.fn(async () => new Blob(['klein']));
    let n = 0;
    const r = createMediaResolver({
      adapter: adapter(['Pictures/gross.bmp']),
      store: memStore(),
      createObjectUrl: () => `blob:fake/${++n}`,
      revokeObjectUrl: () => {},
      makeThumbnail,
    });
    await r.connect();

    // 126 der 189 Bilddateien des Bestands sind unkomprimierte BMP — genau dafür.
    const res = await r.resolveThumbnail('Pictures/gross.bmp');
    expect(makeThumbnail).toHaveBeenCalledTimes(1);
    expect(res.state).toBe('ok');
  });

  it('die KACHEL ruft tatsächlich die verkleinerte Fassung ab — die große Vorschau nicht', async () => {
    // Beim Bau war `resolveThumbnail` zuerst vorhanden, aber von keiner Kachel benutzt:
    // die Dienst-Tests oben blieben grün, das Raster lud trotzdem Originale. Deshalb
    // prüft dieser Test die KOMPONENTE, nicht den Dienst.
    const makeThumbnail = vi.fn(async () => new Blob(['klein']));
    let n = 0;
    const r = createMediaResolver({
      adapter: adapter(['Pictures/gross.bmp']),
      store: memStore(),
      createObjectUrl: () => `blob:fake/${++n}`,
      revokeObjectUrl: () => {},
      makeThumbnail,
    });
    await r.connect();

    const tile = render(MediaThumb, {
      props: { file: 'Pictures/gross.bmp', form: 'image/bmp', resolver: r, size: 'tile' as const },
    });
    await waitFor(() => expect(tile.container.querySelector('img')).not.toBeNull());
    expect(makeThumbnail).toHaveBeenCalledTimes(1);

    makeThumbnail.mockClear();
    const large = render(MediaThumb, {
      props: { file: 'Pictures/gross.bmp', form: 'image/bmp', resolver: r, size: 'large' as const },
    });
    await waitFor(() => expect(large.container.querySelector('img')).not.toBeNull());
    expect(makeThumbnail).not.toHaveBeenCalled();
  });

  it('fällt ohne Verkleinerungs-Fähigkeit auf das Original zurück (kein Anzeige-Vorbehalt)', async () => {
    const r = await connected(['Pictures/gross.bmp']);
    const res = await r.resolveThumbnail('Pictures/gross.bmp');
    expect(res.state).toBe('ok');
    expect(res.url).toMatch(/^blob:/);
  });

  it('fällt auch dann auf das Original zurück, wenn das Verkleinern fehlschlägt', async () => {
    let n = 0;
    const r = createMediaResolver({
      adapter: adapter(['Pictures/exotisch.tif']),
      store: memStore(),
      createObjectUrl: () => `blob:fake/${++n}`,
      revokeObjectUrl: () => {},
      makeThumbnail: async () => {
        throw new Error('Format nicht dekodierbar');
      },
    });
    await r.connect();
    expect((await r.resolveThumbnail('Pictures/exotisch.tif')).state).toBe('ok');
  });
});
