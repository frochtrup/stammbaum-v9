// tests/ui/onboarding-model.test.ts — der Erstnutzer-Rundgang als reine Funktionen
// (BL-213, ADR-v9-190). Zwei Dinge werden hier festgehalten:
//
//   1. die Schritt-TEXTE kommen aus dem Navigations-Register, nicht aus einer zweiten
//      Liste — das ist der eigentliche Unterschied zur v8-Form (`ui-onboarding.js` trug
//      vier fest verdrahtete Ids und Beschriftungen, zwei davon zeigen in v9 ins Leere);
//   2. die Spotlight-Geometrie ist Arithmetik und braucht keinen Browser — v8 rechnete
//      sie zwischen `style.setProperty`-Aufrufen und konnte sie nur im Gerät prüfen.
import { describe, expect, it } from 'vitest';
import { cardPosition, spotlightHole, stepLabel, tourSteps } from '../../ui/shell/onboarding-model';
import { ENTITY_TARGETS, LENS_SLOT_TARGETS, NAV_ROLE_LABELS, navTargetById } from '../../ui/shell/nav-model';

describe('Rundgang — Schritte aus dem Register (INV-UI-15)', () => {
  it('nennt genau vier Schritte mit den Ankern des echten UI', () => {
    expect(tourSteps().map((s) => s.anchor)).toEqual(['list', 'segments', 'lens', 'more']);
  });

  it('führt JEDES weitere Entitäts-Segment im Text auf — auch ein künftig ergänztes', () => {
    const text = tourSteps()[1].text;
    for (const t of ENTITY_TARGETS) {
      if (t.id === 'person') continue;
      // Fällt rot aus, sobald ein Segment dazukommt oder umbenannt wird — genau das war
      // in v8 die Drift-Stelle (die Tour behauptete „Personen, Familien oder Quellen",
      // während das UI längst mehr trug).
      expect(text, `Segment „${t.label}" fehlt im Rundgang`).toContain(t.label);
    }
  });

  it('führt jede Lens des Umschalters auf und trägt den Rollennamen als Titel', () => {
    const step = tourSteps()[2];
    expect(step.title).toBe(NAV_ROLE_LABELS.lens);
    for (const id of LENS_SLOT_TARGETS) expect(step.text).toContain(navTargetById(id).label);
  });

  it('nennt den Weg zur eigenen Datei mit den Beschriftungen des Registers', () => {
    // „Mehr → Datei" — beide Wörter aus dem Register. Die v8-Fassung sagte „über das
    // Menü ☰ oben rechts", ein Bedienelement, das v9 bewusst abgeschafft hat.
    expect(tourSteps()[3].text).toContain(navTargetById('file').label);
    expect(tourSteps()[3].text).toContain('Mehr');
  });

  it('zählt die Schritte für den Nutzer sichtbar', () => {
    expect(stepLabel(0, 4)).toBe('Schritt 1 von 4');
    expect(stepLabel(3, 4)).toBe('Schritt 4 von 4');
  });
});

describe('Rundgang — Spotlight-Geometrie', () => {
  const viewport = { width: 375, height: 812 };

  it('legt das Loch mit Polsterung um das Ziel', () => {
    const hole = spotlightHole({ top: 100, left: 50, width: 200, height: 40 }, viewport);
    expect(hole).toEqual({ top: 92, left: 42, width: 216, height: 56 });
  });

  it('beschneidet das Loch am Bildschirmrand statt darüber hinauszuragen', () => {
    const hole = spotlightHole({ top: 0, left: 0, width: 375, height: 30 }, viewport);
    expect(hole).toEqual({ top: 0, left: 0, width: 375, height: 38 });
  });

  it('liefert kein Loch für ein Ziel ohne Fläche (nicht gerendert)', () => {
    // v8s `_obNoSpotlight`-Fall: die Karte steht dann mittig, statt ein Loch der Größe
    // null irgendwo in die Ecke zu setzen.
    expect(spotlightHole({ top: 0, left: 0, width: 0, height: 0 }, viewport)).toBeNull();
  });

  it('stellt die Karte unter das Loch, wenn sie dort hineinpasst', () => {
    const hole = { top: 100, left: 20, width: 200, height: 40 };
    expect(cardPosition(hole, viewport, { width: 300, height: 160 })).toEqual({ top: 152, left: 20 });
  });

  it('klappt die Karte über das Loch, wenn unten kein Platz ist', () => {
    const hole = { top: 700, left: 20, width: 200, height: 60 };
    expect(cardPosition(hole, viewport, { width: 300, height: 160 })).toEqual({ top: 528, left: 20 });
  });

  it('dockt die Karte unten an, wenn weder darüber noch darunter Platz ist', () => {
    // Der Fall der eigenen Verifikation: ein bildschirmhohes Ziel (die Liste). Die Karte
    // MUSS überlappen — dann unten, damit Kopfzeile und Segment-Umschalter sichtbar
    // bleiben; oben lag sie genau über dem Ziel des nächsten Schritts.
    const hole = { top: 87, left: 0, width: 375, height: 661 };
    const pos = cardPosition(hole, viewport, { width: 300, height: 160 }, { bottomInset: 83 });
    expect(pos!.top).toBe(812 - 83 - 160 - 8);
  });

  it('bleibt im Bild, wenn die Karte höher ist als der Platz überhaupt', () => {
    // Entartungsfall (sehr kleines Fenster): lieber oben anschlagen als aus dem Bild
    // laufen — die Karte trägt die einzigen Bedienknöpfe des Rundgangs.
    const winzig = { width: 375, height: 150 };
    const pos = cardPosition({ top: 60, left: 300, width: 60, height: 40 }, winzig, { width: 300, height: 160 });
    expect(pos!.top).toBe(8);
    expect(pos!.left).toBe(67); // 375 − 300 − 8: an den rechten Rand geschoben, nicht darüber
  });

  it('lässt Platz für die Bottom-Nav, statt die Karte halb dahinter zu legen', () => {
    const hole = { top: 100, left: 20, width: 200, height: 480 };
    // Ohne Nav-Streifen passt sie knapp darunter: 592 + 160 = 752 < 812.
    expect(cardPosition(hole, viewport, { width: 300, height: 160 })!.top).toBe(592);
    // Mit Nav-Streifen nicht mehr — dann dockt sie genau darüber an (561 + 160 = 721 =
    // Oberkante der Navigation).
    expect(cardPosition(hole, viewport, { width: 300, height: 160 }, { bottomInset: 83 })!.top).toBe(561);
  });

  it('meldet „mittig" (null), wenn es kein Loch gibt', () => {
    expect(cardPosition(null, viewport, { width: 300, height: 160 })).toBeNull();
  });
});
