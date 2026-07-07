// @vitest-environment happy-dom
// tests/islands/timeline-view.test.ts — imperatives DOM-Rendering der Zeitleiste-Insel
// (ui/islands/timeline/timeline-view.ts). Deckt bewusst NUR strukturelle Invarianten des
// gebauten DOM ab, NICHT gerenderte Pixel/echtes Scroll-Verhalten (Spec 32 §2: "Pixel
// testest du nicht, Positionen schon" — hier sogar noch schwächer: happy-dom hat kein
// echtes Layout/keinen echten position:sticky-Constraint-Solver, daher kann dieser Test
// nur die CSS-Struktur verriegeln, die den Sticky-Fix TRÄGT, nicht das visuelle
// Sticky-Verhalten selbst simulieren. Der eigentliche Beleg für "bleibt beim Scrollen
// stehen" ist die Browser-Verifikation (preview_eval + getBoundingClientRect, s.
// Bugfix-Kommentar in timeline-view.ts) — dieser Test ist die strukturelle
// Regressionssperre dafür, dass diese Invariante nicht wieder verloren geht.
//
// Bug-Historie (Nutzer-Meldung, browser-reproduziert): `.tl-swim-axis`/`.tl-lane` sind
// `display:flex`-Kinder eines `display:flex`-Scroll-Containers (`.tl-body.tl-swim`).
// Ohne eigene explizite Breite werden sie vom Flex-Cross-Achsen-Stretch auf die
// Container-Breite gestreckt, während ihr Inhalt (`.tl-swim-axis-track`/`.tl-lane-body`)
// per `overflow:visible` optisch darüber hinausragt — die für `position:sticky` als
// Referenz dienende eigene Box bleibt schmaler als der Scroll-Bereich, wodurch die
// Sticky-Verankerung von `.tl-swim-axis-pad`/`.tl-lane-lbl` (`left:0`) nicht mit dem
// tatsächlichen Scroll übereinstimmt (Label rutscht mit nach links weg).
import { describe, expect, it } from 'vitest';
import { mountTimelineView } from '../../ui/islands/timeline/timeline-view';
import { computeSwimLaneLayout, SWIM_LANE_LABEL_W } from '../../ui/islands/timeline/timeline-model';
import type { TimelinePersonEvent } from '../../ui/islands/timeline/timeline-model';

function multiDecadeEvents(): TimelinePersonEvent[] {
  const events: TimelinePersonEvent[] = [];
  for (let i = 0; i < 6; i++) {
    const year = 1880 + i * 10;
    events.push({
      personIdx: 0,
      personId: '@I1@',
      year,
      date: String(year),
      type: i === 0 ? 'birth' : 'event',
      label: `Ereignis ${i}`,
      title: `Ereignis ${i}`,
      desc: '',
      place: 'Musterstadt',
      gedType: 'RESI',
      eventType: '',
    });
  }
  return events;
}

describe('mountTimelineView (Swim-Lane) — Sticky-Fix strukturelle Invariante', () => {
  it('setzt auf `.tl-swim-axis` eine explizite Breite = Label-Breite + totalWidth (nicht dem Flex-Stretch überlassen)', () => {
    const host = document.createElement('div');
    const swim = computeSwimLaneLayout(multiDecadeEvents(), [], 600);
    const handle = mountTimelineView(host, {});
    handle.update({ mode: 'swim', swim, decade: null, isMulti: false, primaryBirthYear: 1880 });

    const axis = host.querySelector('.tl-swim-axis') as HTMLElement;
    expect(axis).toBeTruthy();
    expect(axis.style.width).toBe(`${SWIM_LANE_LABEL_W + swim.totalWidth}px`);
  });

  it('setzt auf JEDER `.tl-lane` dieselbe explizite Breite = Label-Breite + totalWidth', () => {
    const host = document.createElement('div');
    const swim = computeSwimLaneLayout(multiDecadeEvents(), [], 600);
    const handle = mountTimelineView(host, {});
    handle.update({ mode: 'swim', swim, decade: null, isMulti: false, primaryBirthYear: 1880 });

    const lanes = [...host.querySelectorAll('.tl-lane')] as HTMLElement[];
    expect(lanes.length).toBeGreaterThan(0);
    for (const lane of lanes) {
      expect(lane.style.width).toBe(`${SWIM_LANE_LABEL_W + swim.totalWidth}px`);
    }
  });

  it('die explizite Breite deckt IMMER den vollen Inhalt der `-track`/`-body`-Kinder ab (Breite >= Kind-Breite)', () => {
    const host = document.createElement('div');
    const swim = computeSwimLaneLayout(multiDecadeEvents(), [], 600);
    const handle = mountTimelineView(host, {});
    handle.update({ mode: 'swim', swim, decade: null, isMulti: false, primaryBirthYear: 1880 });

    const axis = host.querySelector('.tl-swim-axis') as HTMLElement;
    const track = host.querySelector('.tl-swim-axis-track') as HTMLElement;
    const pad = host.querySelector('.tl-swim-axis-pad') as HTMLElement;
    const axisW = parseFloat(axis.style.width);
    const trackW = parseFloat(track.style.width);
    const padW = parseFloat(pad.style.width);
    expect(axisW).toBeGreaterThanOrEqual(trackW + padW);

    const lane = host.querySelector('.tl-lane') as HTMLElement;
    const body = lane.querySelector('.tl-lane-body') as HTMLElement;
    const lbl = lane.querySelector('.tl-lane-lbl') as HTMLElement;
    const laneW = parseFloat(lane.style.width);
    const bodyW = parseFloat(body.style.width);
    const lblStyleOrCssWidth = parseFloat(lbl.style.width || String(SWIM_LANE_LABEL_W));
    expect(laneW).toBeGreaterThanOrEqual(bodyW + lblStyleOrCssWidth - 1); // -1 Rundungstoleranz
  });

  it('setzt weiterhin `position:sticky; left:0` auf `.tl-lane-lbl` UND `.tl-swim-axis-pad` (CSS-Klassen unverändert, nur Breite ist der Fix)', () => {
    const host = document.createElement('div');
    const swim = computeSwimLaneLayout(multiDecadeEvents(), [], 600);
    const handle = mountTimelineView(host, {});
    handle.update({ mode: 'swim', swim, decade: null, isMulti: false, primaryBirthYear: 1880 });

    // happy-dom wertet KEIN externes Stylesheet aus computed styles hier verlässlich aus
    // (kein echter Cascade-Solver für importierte .css-Dateien) — daher wird die
    // Klassen-Anwesenheit geprüft (die eigentliche sticky/left-Deklaration lebt in
    // timeline-view.css und ist per Browser-Verifikation belegt), nicht getComputedStyle.
    expect(host.querySelector('.tl-lane-lbl')).toBeTruthy();
    expect(host.querySelector('.tl-swim-axis-pad')).toBeTruthy();
  });

  it('bleibt bei genau EINEM Ereignis (schmaler Inhalt, availableWidth > totalWidth-Bedarf) konsistent — keine negative/NaN-Breite', () => {
    const host = document.createElement('div');
    const singleEvent: TimelinePersonEvent[] = [
      {
        personIdx: 0,
        personId: '@I1@',
        year: 1900,
        date: '1900',
        type: 'birth',
        label: 'Geburt',
        title: 'Geburt',
        desc: '',
        place: 'Musterstadt',
      },
    ];
    const swim = computeSwimLaneLayout(singleEvent, [], 800);
    const handle = mountTimelineView(host, {});
    handle.update({ mode: 'swim', swim, decade: null, isMulti: false, primaryBirthYear: 1900 });

    const axis = host.querySelector('.tl-swim-axis') as HTMLElement;
    const axisW = parseFloat(axis.style.width);
    expect(Number.isNaN(axisW)).toBe(false);
    expect(axisW).toBeGreaterThan(0);
    expect(axisW).toBe(SWIM_LANE_LABEL_W + swim.totalWidth);
  });
});

describe('mountTimelineView (Dekaden) — kein horizontaler Scroll-Bereich, Sticky-Fix nicht relevant', () => {
  it('rendert `.tl-wrap` ohne `.tl-lane`/`.tl-swim-axis` (Bug betrifft nur den Swim-Lane-Modus)', () => {
    const host = document.createElement('div');
    const handle = mountTimelineView(host, {});
    handle.update({
      mode: 'decade',
      swim: null,
      decade: {
        decades: [{ decadeStart: 1900, personEvents: [], histEvents: [], height: 90 }],
        totalHeight: 90,
      },
      isMulti: false,
      primaryBirthYear: 1900,
    });

    expect(host.querySelector('.tl-wrap')).toBeTruthy();
    expect(host.querySelector('.tl-lane')).toBeNull();
    expect(host.querySelector('.tl-swim-axis')).toBeNull();
  });
});
