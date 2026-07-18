import { mount } from 'svelte';
import '../ui/shell/design-system.css';
import App from './App.svelte';
import { registerServiceWorker } from './sw-register';
import { swUpdate } from '../ui/shell/sw-update.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app root element missing');

mount(App, { target });

// Service Worker nur im Produktions-Build (BL-02, Spec 30 NFR-2): im Dev-Server würde
// er Vites HMR-Assets abfangen und Änderungen scheinbar verschlucken.
// `import.meta.env.BASE_URL` trägt das Vite-`base` (`/stammbaum-v9/` im Build) — daraus
// der SW-Pfad, damit sein Scope die ganze App umfasst.
if (import.meta.env.PROD) {
  registerServiceWorker(`${import.meta.env.BASE_URL}sw.js`, {
    onUpdateReady: () => swUpdate.markReady()
  });
}
