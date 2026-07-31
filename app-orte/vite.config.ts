// app-orte/vite.config.ts — Bau des Standalone-Orte-Editors (Spec 22 §2, ADR-v9-161).
//
// EIGENE Konfiguration statt eines gemeinsamen Mehrfach-Einstiegs: die Hauptkonfiguration
// setzt `root: 'app'`; ein geteilter Einstieg müsste diese Wurzel verschieben und damit
// den bestehenden, funktionierenden Bau anfassen. Eine zweite Datei lässt ihn unberührt.
//
// Sie liegt IM Editor-Baum, nicht im Wurzelverzeichnis — sein Bau-Wissen bleibt bei ihm
// (und wandert mit, sollte er je ein eigenes Repo bekommen).

import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { injectCspMeta } from '../app/csp-plugin';
import { serviceWorkerPlugin } from '../app/sw-plugin';

const here = fileURLToPath(new URL('.', import.meta.url));

// Dieselbe Richtlinie wie das Hauptprogramm (Spec 30 NFR-3) — der Editor zeigt dieselben
// Komponenten, inklusive Leaflet-Kartenvorschau und Nominatim-Geocoding auf Nutzeraktion.
function cspPlugin(): Plugin {
  return {
    name: 'csp-meta',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      return injectCspMeta(html, ctx.server ? 'serve' : 'build');
    }
  };
}

// `base`: exakt die Regel aus Spec 31 §5 — command-abhängig, und `isPreview` zählt als
// Build (Vite meldet für `vite preview` intern `command === 'serve'`; ein alleiniger
// command-Check ließe die Vorschau auf `/` zurückfallen, während dist/orte/index.html
// bereits mit dem Unterpfad gebaut ist → MIME-Mismatch statt Modul).
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/stammbaum-v9/orte/' : '/',
  root: here,
  plugins: [
    svelte({ configFile: fileURLToPath(new URL('../svelte.config.js', import.meta.url)) }),
    cspPlugin(),
    // Precache-Manifest in dist/orte/sw.js injizieren — dasselbe Plugin, eigener outDir.
    serviceWorkerPlugin()
  ],
  server: {
    // Eigener Default-Port: Haupt- und Editor-Dev-Server sollen nebeneinander laufen
    // können, ohne dass einer den anderen verdrängt.
    port: process.env.PORT ? Number(process.env.PORT) : 5174
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/orte', import.meta.url)),
    // Beide Programme füllen dasselbe Auslieferungsverzeichnis; ein Leeren würde je nach
    // Reihenfolge das andere löschen.
    emptyOutDir: false
  }
}));
