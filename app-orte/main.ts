// app-orte/main.ts — Einstiegspunkt des Standalone-Orte-Editors (Spec 22 §2).
//
// Dasselbe Design-System wie das Hauptprogramm (INV-UI-4) — der Editor zeigt dessen
// Komponenten, also muss er auch deren Variablen und Grundstile mitbringen.
//
// Service Worker mit EIGENEM Cache-Namensraum (OE-10): beide Programme liegen auf
// demselben Origin, und die Aufräum-Logik des Workers verwirft „alles mit meinem Präfix
// außer meiner Version" — mit geteiltem Präfix löschten sie sich gegenseitig die Shell.
import { mount } from 'svelte';
import '../ui/shell/design-system.css';
import OrteApp from './OrteApp.svelte';
import { registerServiceWorker } from '../app/sw-register';
import { swUpdate } from '../ui/shell/sw-update.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app root element missing');

mount(OrteApp, { target });

// Nur im Produktions-Build: im Dev-Server finge der Worker Vites HMR-Assets ab.
if (import.meta.env.PROD) {
  registerServiceWorker(`${import.meta.env.BASE_URL}sw.js`, {
    onUpdateReady: () => swUpdate.markReady()
  });
}
