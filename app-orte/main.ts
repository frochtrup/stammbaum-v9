// app-orte/main.ts — Einstiegspunkt des Standalone-Orte-Editors (Spec 22 §2).
//
// Dasselbe Design-System wie das Hauptprogramm (INV-UI-4) — der Editor zeigt dessen
// Komponenten, also muss er auch deren Variablen und Grundstile mitbringen.
//
// KEIN Service Worker in dieser Fassung (OE-10 führt ihn nach): ein Editor, der beim
// ersten Aufruf offline-fähig sein soll, braucht einen eigenen Cache-Namensraum — sonst
// überschreiben sich die beiden Programme gegenseitig die Shell.
import { mount } from 'svelte';
import '../ui/shell/design-system.css';
import OrteApp from './OrteApp.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app root element missing');

mount(OrteApp, { target });
