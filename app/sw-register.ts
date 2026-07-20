// Service-Worker-Registrierung + Update-Erkennung (BL-02, Spec 30 NFR-2).
//
// Plattform-Schicht: `navigator.serviceWorker` lebt hier, NICHT im Kern (INV-ARCH-1).
// Die eigentliche Zustandslogik („wann gilt ein Update als bereit?") steckt in
// `updateStateFrom()` und ist als reine Funktion getestet — der Rest ist Verdrahtung.

export interface SwUpdateHandle {
  /** Wird gerufen, sobald eine neue Version installiert und wartebereit ist. */
  onUpdateReady: () => void;
}

/**
 * Ein wartender Worker bedeutet: neue Version fertig installiert, aber bewusst NICHT
 * aktiviert (der SW ruft kein `skipWaiting()`). Genau dann — und nur dann — darf der
 * Hinweis erscheinen.
 *
 * Der zweite Teil ist der Erstinstallations-Fall: beim allerersten Besuch gibt es
 * keinen Controller. Dann ist der wartende/installierte Worker kein *Update*, sondern
 * die Erstauslieferung — ein „Neue Version verfügbar"-Hinweis wäre dort schlicht
 * falsch und würde beim ersten Start jeder frischen Installation aufpoppen.
 */
export function updateStateFrom(input: {
  hasWaiting: boolean;
  hasController: boolean;
}): 'update-ready' | 'idle' {
  return input.hasWaiting && input.hasController ? 'update-ready' : 'idle';
}

/**
 * Registriert den Service Worker und meldet ein bereitstehendes Update.
 *
 * Bewusst ein No-op ohne `serviceWorker`-Unterstützung bzw. im Dev-Server: unter Vite
 * würde ein aktiver SW die HMR-Assets abfangen und Änderungen scheinbar verschlucken
 * — die daraus entstehenden „warum sehe ich meine Änderung nicht"-Sitzungen sind in
 * v8 mehrfach passiert (s. Memory `feedback_preview_verification`).
 */
export function registerServiceWorker(swUrl: string, handle: SwUpdateHandle): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const container = navigator.serviceWorker;

  const check = (registration: ServiceWorkerRegistration) => {
    const state = updateStateFrom({
      hasWaiting: Boolean(registration.waiting),
      hasController: Boolean(container.controller)
    });
    if (state === 'update-ready') handle.onUpdateReady();
  };

  container
    .register(swUrl, { type: 'classic' })
    .then((registration) => {
      check(registration);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') check(registration);
        });
      });

      // BFCache-Guard (Spec 30 NFR-2): eine aus dem Back-/Forward-Cache
      // wiederhergestellte Seite hat die Update-Prüfung beim Laden übersprungen —
      // sie kann beliebig lange „eingefroren" gewesen sein. Beim Auftauchen erneut
      // nachsehen, statt eine veraltete Shell weiterlaufen zu lassen.
      window.addEventListener('pageshow', (event) => {
        if ((event as PageTransitionEvent).persisted) {
          registration.update().then(() => check(registration));
        }
      });
    })
    .catch(() => {
      // Registrierung fehlgeschlagen (privater Modus, abgeschaltete SW, HTTP statt
      // HTTPS): die App funktioniert online unverändert weiter, nur eben ohne
      // Offline-Betrieb. Kein Grund, den Start abzubrechen.
    });
}

/**
 * Übernimmt die wartende Version: `SKIP_WAITING` an den Worker, danach lädt die Seite
 * neu, sobald der neue Worker die Kontrolle hat.
 *
 * `controllerchange` statt eines direkten `location.reload()`: erst wenn der neue
 * Worker wirklich übernommen hat, liefert ein Reload auch die neue Shell — sonst
 * bekäme der Nutzer nach dem Klick genau die alte Version zurück, die er loswerden
 * wollte.
 */
export function applyUpdate(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;

  container.getRegistration().then((registration) => {
    if (!registration?.waiting) return;
    container.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
}
