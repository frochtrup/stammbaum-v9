// services/places/device-id-adapter.ts — echte Geräte-ID-Quelle (Spec 30 §4 LP-9).
//
// Verhalten als v8-Orakel geprüft (`_placeDeviceId()` in legacy-v8/ui-forms.js), NICHT
// 1:1 übernommen: v8 generiert `'d_' + Math.random()… + '_' + Date.now()…` und persistiert
// unter `localStorage['stammbaum_device_id']`. v9 übernimmt das Prinzip (einmalig
// generieren + lokal persistieren, gleicher Storage-Key zur Wiedererkennung bei
// zukünftiger Migration), ersetzt aber `Math.random()` durch `crypto.randomUUID()`
// (kollisionssicherer, keine Wall-Clock im Erzeugungs-Pfad nötig) — Plattform-API bewusst
// NUR hier, hinter DeviceIdProvider (types.ts), damit places-sync-service.ts mit einer
// injizierten festen ID testbar bleibt (Spec 32 §5 TST-3).

import type { DeviceIdProvider } from './types';

const STORAGE_KEY = 'stammbaum_device_id';

export class LocalStorageDeviceIdProvider implements DeviceIdProvider {
  deviceId(): string {
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) return existing;
    } catch {
      // localStorage kann in seltenen Sandboxen fehlen — dann keine Persistenz,
      // aber eine gültige ID für die laufende Session.
    }
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `d_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // s.o. — best effort.
    }
    return id;
  }
}
