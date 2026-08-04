// tests/services/share-adapter.test.ts — die Fähigkeitsprüfung des Share-Tiers
// (Spec 14 §4, ADR-v9-194).
//
// Warum ein eigener Test am ECHTEN Adapter statt am gemockten Seam: der Defekt lag nicht
// in der Tier-Auswahl (die war korrekt), sondern in der Antwort, die der Adapter ihr gab.
// `navigator.canShare({files})` meldet auf macOS `true` — das Share-Sheet dort bietet aber
// kein „In Dateien sichern", der Nutzer landete in einer Sackgasse ohne jeden Speicherweg.
// Geprüft wird deshalb genau die Frage, die `isSupported()` beantworten soll: „ist das
// hier ein tauglicher Speicherweg", nicht „existiert die API".

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavigatorShareAdapter } from '../../services/file/share-adapter';

/** Ein Navigator-Double mit genau den drei Eigenschaften, die die Prüfung liest. */
function stubNavigator(opts: { share?: boolean; canShareFiles?: boolean; maxTouchPoints: number }): void {
  const nav: Record<string, unknown> = { maxTouchPoints: opts.maxTouchPoints };
  if (opts.share ?? true) nav.share = async () => {};
  if (opts.canShareFiles !== undefined) nav.canShare = () => opts.canShareFiles!;
  vi.stubGlobal('navigator', nav);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NavigatorShareAdapter.isSupported — Tier 2a nur, wo das Sheet auch speichert', () => {
  it('macOS (Share-API vorhanden, canShare(files) true, KEIN Touch): nicht tauglich', () => {
    // Exakt der gemeldete Fall: das Sheet erscheint, hat aber kein „In Dateien sichern".
    stubNavigator({ canShareFiles: true, maxTouchPoints: 0 });
    expect(new NavigatorShareAdapter().isSupported()).toBe(false);
  });

  it('iOS/iPadOS (canShare(files) true, Touch): tauglich', () => {
    stubNavigator({ canShareFiles: true, maxTouchPoints: 5 });
    expect(new NavigatorShareAdapter().isSupported()).toBe(true);
  });

  it('Touch-Plattform ohne Datei-Share (canShare(files) false): nicht tauglich', () => {
    stubNavigator({ canShareFiles: false, maxTouchPoints: 5 });
    expect(new NavigatorShareAdapter().isSupported()).toBe(false);
  });

  it('ohne navigator.share überhaupt: nicht tauglich', () => {
    stubNavigator({ share: false, canShareFiles: true, maxTouchPoints: 5 });
    expect(new NavigatorShareAdapter().isSupported()).toBe(false);
  });

  it('ohne canShare (ältere Implementierung), aber Touch: optimistisch tauglich', () => {
    // Der bestehende Optimismus bleibt — er darf nur nicht mehr den Desktop mitnehmen.
    stubNavigator({ maxTouchPoints: 5 });
    expect(new NavigatorShareAdapter().isSupported()).toBe(true);
  });

  it('ohne canShare und ohne Touch: nicht tauglich', () => {
    stubNavigator({ maxTouchPoints: 0 });
    expect(new NavigatorShareAdapter().isSupported()).toBe(false);
  });
});
