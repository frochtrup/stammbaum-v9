// ui/islands/timeline/timeline-view.ts — imperative Zeitleiste-Insel (Spec 02 §5,
// Spec 20 §1.10 [S]). Framework-freies Vanilla-DOM in einem von der reaktiven Schale
// gestellten Container. Konsumiert AUSSCHLIESSLICH die reinen Layout-Ergebnisse aus
// timeline-model.ts (computeSwimLaneLayout/computeDecadeLayout) — kein eigenes
// Modell-Rechnen hier (Trennung Layout<->Rendering, Spec 02 §5).
//
// Ein Insel-Modul für beide Modi (Swim-Lane horizontal + Dekaden vertikal), Modus per
// Parameter statt zweier Dateien — Vereinfachen vor Erfinden (Auftrag), analog wie
// svg-fallback-map.ts alle 3 Kartenmodi in einer Datei behandelt.
//
// Bei jedem `update()`: kompletter Neu-Aufbau (kein Fein-Diffing, Spec 02 §5). Die
// Insel ruft nach oben ausschließlich über Callbacks (`onSelectPerson`) — kein
// ViewState-/Kommando-Zugriff (INV-ARCH-1-analoge Regel für Inseln).
//
// CSP-Konformität (Orakel-Lehre, legacy-v8/ui-timeline.js Kommentar "CSP style-src
// 'self'"): keine inline `style="..."`-Attribute im HTML-String-Bau — Positionen werden
// nach dem Einhängen per JS-CSSOM (`el.style.xxx = ...`) gesetzt.
import type { TimelinePersonEvent, SwimLaneResult, DecadeLayoutResult } from './timeline-model';
import { personColor, SWIM_LANE_LABEL_W } from './timeline-model';

export type TimelineMode = 'swim' | 'decade';

export interface TimelineMountData {
  mode: TimelineMode;
  /** Nur im Swim-Lane-Modus benötigt (computeSwimLaneLayout-Ergebnis). */
  swim: SwimLaneResult | null;
  /** Nur im Dekaden-Modus benötigt (computeDecadeLayout-Ergebnis, Single-Person). */
  decade: DecadeLayoutResult | null;
  /** true, sobald mehr als eine Person aktiv ist (Farbzuordnung/Personen-Dot im Tooltip). */
  isMulti: boolean;
  /** Geburtsjahr der primären Person (Index 0) für die Alter-Anzeige; `null` = kein Alter. */
  primaryBirthYear: number | null;
}

export interface TimelineMountOptions {
  onSelectPerson?: (personId: string) => void;
}

export interface TimelineIslandHandle {
  update(data: TimelineMountData): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function ageSuffix(year: number | null, birthYear: number | null): string {
  if (birthYear === null || year === null) return '';
  return ` (${year - birthYear})`;
}

function chipTooltip(ev: TimelinePersonEvent, birthYear: number | null, isMulti: boolean, personName: string): string {
  const parts: string[] = [];
  if (isMulti && personName) parts.push('👤 ' + personName);
  if (ev.date) parts.push(ev.date);
  else if (ev.year !== null) parts.push(String(ev.year) + ageSuffix(ev.year, birthYear));
  const typePart = ev.title || ev.label || '';
  const descPart = ev.desc || '';
  if (typePart) parts.push(descPart ? `${typePart}: ${descPart}` : typePart);
  if (ev.place) parts.push(ev.place);
  return parts.join('\n');
}

function buildChipEl(
  ev: TimelinePersonEvent,
  birthYear: number | null,
  isMulti: boolean,
  onSelectPerson?: (id: string) => void,
): HTMLDivElement {
  const chip = el('div', `tl-chip tl-chip--${ev.type}`);
  if (ev.year === null) chip.classList.add('tl-chip--undated');
  if (isMulti) chip.classList.add(`tl-pc${ev.personIdx}`);
  chip.title = chipTooltip(ev, birthYear, isMulti, '');
  if (isMulti) {
    const dot = el('span', `tl-chip-dot tl-pc${ev.personIdx}`);
    chip.appendChild(dot);
  }
  if (ev.year !== null) {
    const yr = el('span', 'tl-y');
    yr.textContent = String(ev.year) + ageSuffix(ev.year, birthYear);
    chip.appendChild(yr);
  }
  const type = el('span', 'tl-type');
  type.textContent = ev.title || ev.label || '';
  chip.appendChild(type);
  if (ev.desc) {
    const desc = el('span', 'tl-desc');
    desc.textContent = ev.desc;
    chip.appendChild(desc);
  }
  if (ev.place) {
    const place = el('span', 'tl-place');
    place.textContent = ev.place;
    chip.appendChild(place);
  }
  chip.style.setProperty('--tl-person-color', personColor(ev.personIdx));
  if (onSelectPerson) {
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.addEventListener('click', () => onSelectPerson(ev.personId));
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelectPerson(ev.personId);
      }
    });
  }
  return chip;
}

function renderSwimLane(
  host: HTMLElement,
  swim: SwimLaneResult,
  isMulti: boolean,
  primaryBirthYear: number | null,
  onSelectPerson?: (id: string) => void,
): void {
  host.classList.add('tl-swim');
  host.innerHTML = '';

  // Sticky-Fix (Nutzer-Bug, browser-verifiziert): `.tl-swim-axis`/`.tl-lane` sind
  // `display:flex`-Kinder von `.tl-body.tl-swim` (ebenfalls `display:flex`). Ohne
  // eigene explizite Breite werden sie vom Flex-Cross-Achsen-Stretch auf die
  // Container-Breite (`host.clientWidth`) gestreckt, WÄHREND ihr eigentlicher Inhalt
  // (`.tl-swim-axis-track`/`.tl-lane-body`, beide mit expliziter `totalWidth`-Breite)
  // per `overflow:visible` optisch darüber hinausragt. Die eigene Box von
  // `.tl-swim-axis`/`.tl-lane` bleibt dabei schmaler als der Scroll-Bereich — genau
  // diese Box ist aber die Sticky-Referenzbox für `.tl-swim-axis-pad`/`.tl-lane-lbl`
  // (`position:sticky; left:0`), wodurch deren Sticky-Verankerung nicht mit dem
  // tatsächlichen horizontalen Scroll des `.tl-body.tl-swim`-Containers übereinstimmt
  // (das Label rutscht mit nach links, statt stehen zu bleiben). Fix: `.tl-swim-axis`/
  // `.tl-lane` bekommen dieselbe Gesamtbreite (Label-/Pad-Breite + `totalWidth`) wie
  // ihre `-track`/`-body`-Kinder explizit gesetzt — dann deckt ihre eigene Box den
  // vollen Scroll-Bereich ab und Sticky verankert korrekt am Scroll-Container.
  const swimRowWidth = `${SWIM_LANE_LABEL_W + swim.totalWidth}px`;

  const axis = el('div', 'tl-swim-axis');
  axis.style.width = swimRowWidth;
  const pad = el('div', 'tl-swim-axis-pad');
  pad.style.width = `${SWIM_LANE_LABEL_W}px`;
  axis.appendChild(pad);
  const track = el('div', 'tl-swim-axis-track');
  track.style.width = `${swim.totalWidth}px`;
  const tick0 = Math.ceil(swim.minYear / 10) * 10;
  for (let y = tick0; y <= swim.maxYear + 1; y += 10) {
    const tick = el('div', 'tl-tick');
    tick.style.left = `${Math.round((y - swim.minYear + 1.5) * swim.pxPerYear)}px`;
    tick.textContent = String(y);
    track.appendChild(tick);
  }
  axis.appendChild(track);
  host.appendChild(axis);

  for (const lane of swim.lanes) {
    const laneEl = el('div', `tl-lane tl-lane--${lane.id}`);
    laneEl.style.height = `${lane.height}px`;
    laneEl.style.width = swimRowWidth;
    const lbl = el('div', 'tl-lane-lbl');
    lbl.textContent = lane.label;
    laneEl.appendChild(lbl);
    const body = el('div', 'tl-lane-body');
    body.style.width = `${swim.totalWidth}px`;

    if (lane.id === 'hist') {
      // Kollisions-Ausweich wie bei Personen-Chips (nudge aus computeSwimLaneLayout):
      // dicht beieinanderliegende historische Ereignisse überlappen sich sonst textlich
      // (Chips sind nowrap-breiter als der Jahresabstand bei enger Zeitskala).
      const histRowH = 18;
      for (const hc of swim.histChips) {
        const chip = el('div', `tl-hist-evt tl-hist-evt--${hc.cat}`);
        chip.style.left = `${hc.pxLeft}px`;
        chip.style.top = hc.nudge === 1 ? '2px' : hc.nudge === -1 ? `${2 + histRowH}px` : '10px';
        chip.title = `${hc.year}: ${hc.label}`;
        const yr = el('span', 'tl-y');
        yr.textContent = String(hc.year);
        chip.appendChild(yr);
        const lblEl = el('span', 'tl-lbl');
        lblEl.textContent = hc.label;
        chip.appendChild(lblEl);
        body.appendChild(chip);
      }
    } else {
      const chips = swim.chipsByLane[lane.id];
      for (const c of chips) {
        const chipEl = buildChipEl(c, primaryBirthYear, isMulti, onSelectPerson);
        if (c.pxLeft !== null) {
          chipEl.style.left = `${c.pxLeft}px`;
          body.appendChild(chipEl);
          // Höhe erst NACH dem Einhängen messbar (Orakel: `el.offsetHeight || 40` —
          // ohne echte Messung würde die 40px-Annahme bei tatsächlich ~21px hohen
          // Chips den nudge=-1-Versatz auf denselben Wert wie nudge=0 kollabieren
          // lassen, weil `lane.height - 40 - pad` dann kleiner als `pad` wird).
          const pad2 = 6;
          const chipH = chipEl.offsetHeight || 24;
          if (c.nudge === 1) {
            chipEl.style.top = `${pad2}px`;
            chipEl.style.zIndex = '1';
          } else if (c.nudge === -1) {
            chipEl.style.top = `${Math.max(lane.height - chipH - pad2, pad2)}px`;
            chipEl.style.zIndex = '2';
          } else {
            chipEl.style.top = `${Math.round(Math.max((lane.height - chipH) / 2, pad2))}px`;
          }
        } else {
          chipEl.classList.add('tl-chip--undated-stack');
          body.appendChild(chipEl);
        }
      }
    }

    laneEl.appendChild(body);
    host.appendChild(laneEl);
  }
}

function renderDecade(host: HTMLElement, decade: DecadeLayoutResult, primaryBirthYear: number | null): void {
  host.classList.remove('tl-swim');
  host.innerHTML = '';
  const wrap = el('div', 'tl-wrap');

  for (const dec of decade.decades) {
    const decEl = el('div', 'tl-decade');
    decEl.style.height = `${dec.height}px`;
    const label = el('div', 'tl-dec-label');
    label.textContent = `${dec.decadeStart}er`;
    decEl.appendChild(label);
    decEl.appendChild(el('div', 'tl-axis-seg'));

    const all: Array<{ side: 'p' | 'h'; year: number; label: string; type?: string; place?: string; cat?: string }> = [
      ...dec.personEvents.map((e) => ({ side: 'p' as const, year: e.year as number, label: e.label, type: e.type, place: e.place })),
      ...dec.histEvents.map((e) => ({ side: 'h' as const, year: e.year, label: e.label, cat: e.cat })),
    ].sort((a, b) => a.year - b.year);

    const innerH = dec.height - 20;
    all.forEach((ev, i) => {
      const top = 14 + (all.length > 1 ? i * (innerH / all.length) : innerH / 2 - 10);
      if (ev.side === 'p') {
        const evEl = el('div', `tl-ev tl-ev--${ev.type}`);
        evEl.style.top = `${top}px`;
        const yr = el('span', 'tl-y');
        yr.textContent = String(ev.year) + ageSuffix(ev.year, primaryBirthYear);
        evEl.appendChild(yr);
        const lbl = el('span', 'tl-lbl');
        lbl.textContent = ev.label;
        evEl.appendChild(lbl);
        if (ev.place) {
          const pl = el('span', 'tl-place');
          pl.textContent = ev.place;
          evEl.appendChild(pl);
        }
        decEl.appendChild(evEl);
      } else {
        const evEl = el('div', `tl-hist tl-hist--${ev.cat}`);
        evEl.style.top = `${top}px`;
        const yr = el('span', 'tl-y');
        yr.textContent = String(ev.year);
        evEl.appendChild(yr);
        const lbl = el('span', 'tl-lbl');
        lbl.textContent = ev.label;
        evEl.appendChild(lbl);
        decEl.appendChild(evEl);
      }
    });

    wrap.appendChild(decEl);
  }

  host.appendChild(wrap);
}

/**
 * Mountet die Zeitleiste-Insel. `container` bleibt leer bis zum ersten `update()`
 * (Spec 02 §5: "reaktive Schale rendert nur einen leeren Container").
 */
export function mountTimelineView(container: HTMLElement, options: TimelineMountOptions = {}): TimelineIslandHandle {
  container.classList.add('tl-body');

  function render(data: TimelineMountData): void {
    if (data.mode === 'swim' && data.swim) {
      renderSwimLane(container, data.swim, data.isMulti, data.primaryBirthYear, options.onSelectPerson);
    } else if (data.mode === 'decade' && data.decade) {
      if (data.decade.decades.length === 0) {
        container.classList.remove('tl-swim');
        container.innerHTML = '<p class="tl-empty">Keine datierten Ereignisse vorhanden.</p>';
      } else {
        renderDecade(container, data.decade, data.primaryBirthYear);
      }
    } else {
      container.classList.remove('tl-swim');
      container.innerHTML = '<p class="tl-empty">Keine datierten Ereignisse vorhanden.</p>';
    }
  }

  return {
    update(data: TimelineMountData): void {
      render(data);
    },
    destroy(): void {
      container.innerHTML = '';
      container.classList.remove('tl-body', 'tl-swim');
    },
  };
}
