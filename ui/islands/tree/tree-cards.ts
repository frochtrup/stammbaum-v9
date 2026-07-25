// ui/islands/tree/tree-cards.ts — geteilter Karten-/Linien-/Heirats-Renderer für die
// Baum-Inseln (ADR-v9-123, Spec 21 §8). Sanduhr UND Nachkommen (und künftig der Fächer,
// soweit er Rechteck-Karten zeigt) bauen ihre Personen-Kacheln über EINE Funktion
// (INV-UI-4) statt jede Insel ihre eigene — so bekommt z. B. der Vollständigkeits-Ring
// (BL-121) später EINEN Ort statt drei. Framework-frei: reines DOM, nach oben nur
// Callbacks. Die insel-spezifischen Zusatz-Badges (Kekule, ⚭N, ▼ „mehr Nachkommen")
// hängt der Aufrufer an die zurückgegebene Kachel — der gemeinsame Kern ist Rahmen,
// Geschlecht, Name, Jahre, ½-Badge, Klick/Enter → Auswahl.
import type { Database, PersonId } from '../../../core/model/types';
import type { DrawContext } from './tree-viewport';
import { tooltip } from '../../shell/tooltip';
import { displayNameOr } from '../../shell/person-display';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Gemeinsame Kachel-Beschreibung (Superset über Sanduhr/Nachkommen). */
export interface PersonCardSpec {
  id: PersonId | null;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Gold-Zentrum (Proband). Klick → `onSelectCenter` statt `onSelect` (Detail statt Rezentrieren). */
  isCenter: boolean;
  /** Halb-Kind/-Geschwister (½-Badge + `--half`-Klasse). */
  isHalf?: boolean;
  /** Steht in der Geschwisterzeile (`--sibling`-Klasse). */
  isSibling?: boolean;
  /** Peek-Stapel-Karte (`--peek`-Klasse). */
  isPeek?: boolean;
  /** Stapel-z-index (Peek-Stapel der Sanduhr, Geschwisterstapel der Nachkommen — jeweils
   *  spätere Karte oben). Nur gesetzt, wenn Karten sich bewusst überlappen. */
  zIndex?: number;
}

export interface CardCallbacks {
  /** Klick auf eine Nicht-Zentrum-Karte → Rezentrieren auf diese Person. */
  onSelect: (id: PersonId) => void;
  /** Klick auf die Zentrum-Karte → Detailansicht öffnen (kein Rezentrieren). */
  onSelectCenter?: (id: PersonId) => void;
}

/**
 * Baut eine Personen-Kachel in `ctx.wrap` und gibt sie zurück (für insel-spezifische
 * Zusatz-Badges). Leere Slots (`id===null`, unbekannte Eltern) werden als „?"-Karte
 * gerendert und liefern `null` zurück; fehlt die Person im Modell, wird nichts angehängt.
 */
export function appendPersonCard(
  ctx: DrawContext,
  db: Database,
  spec: PersonCardSpec,
  cb: CardCallbacks,
): HTMLElement | null {
  const div = document.createElement('div');
  div.className =
    'tree-island__card' +
    (spec.isCenter ? ' tree-island__card--center' : '') +
    (spec.isSibling ? ' tree-island__card--sibling' : '') +
    (spec.isHalf ? ' tree-island__card--half' : '') +
    (spec.isPeek ? ' tree-island__card--peek' : '');
  div.style.left = `${Math.round(spec.x)}px`;
  div.style.top = `${Math.round(spec.y)}px`;
  div.style.width = `${spec.width}px`;
  div.style.height = `${spec.height}px`;
  if (spec.zIndex != null) div.style.zIndex = String(spec.zIndex);

  if (!spec.id) {
    div.classList.add('tree-island__card--empty');
    div.textContent = '?';
    ctx.wrap.appendChild(div);
    return null;
  }

  const person = db.individuals.get(spec.id);
  if (!person) return null;
  div.dataset.sex = person.sex;
  div.setAttribute('tabindex', '0');
  div.setAttribute('role', 'button');
  div.dataset.personId = spec.id;

  const nameEl = document.createElement('div');
  nameEl.className = 'tree-island__name';
  nameEl.textContent = displayNameOr(person, spec.id);
  div.appendChild(nameEl);

  const by = (person.birth.date || '').match(/\d{4}/)?.[0];
  const dy = (person.death.date || '').match(/\d{4}/)?.[0];
  const yr = [by ? `*${by}` : '', dy ? `†${dy}` : ''].filter(Boolean).join(' ');
  if (yr) {
    const yrEl = document.createElement('div');
    yrEl.className = 'tree-island__year';
    yrEl.textContent = yr;
    div.appendChild(yrEl);
  }

  if (spec.isHalf) {
    const halfEl = document.createElement('div');
    halfEl.className = 'tree-island__half-badge';
    halfEl.textContent = '½';
    div.appendChild(halfEl);
  }

  const activate = () => {
    if (spec.isCenter) {
      cb.onSelectCenter?.(spec.id!);
    } else {
      cb.onSelect(spec.id!);
    }
  };
  div.addEventListener('click', () => {
    if (ctx.shouldSuppressClick()) return; // Klick nach Drag unterdrücken (Orakel-Verhalten)
    activate();
  });
  div.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  });
  ctx.wrap.appendChild(div);
  return div;
}

/** Verbindungslinie (durchgezogen; `dashed` für Halbgeschwister-Linien der Sanduhr). */
export function appendConnector(
  svg: SVGSVGElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dashed = false,
): void {
  const el = document.createElementNS(SVG_NS, 'line');
  el.setAttribute('x1', String(x1));
  el.setAttribute('y1', String(y1));
  el.setAttribute('x2', String(x2));
  el.setAttribute('y2', String(y2));
  el.setAttribute('class', 'tree-island__line' + (dashed ? ' tree-island__line--half' : ''));
  if (dashed) el.setAttribute('stroke-dasharray', '4 3');
  svg.appendChild(el);
}

/** Klickbarer ⚭-Bereich zwischen Proband- und (erster) Ehepartner-Karte → Familien-Detail. */
export interface MarriageBadgeSpec {
  familyId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function appendMarriageButton(
  ctx: DrawContext,
  badge: MarriageBadgeSpec,
  onSelectFamily: (familyId: string) => void,
): void {
  const btn = document.createElement('div');
  btn.className = 'tree-island__marr-btn';
  btn.style.left = `${Math.round(badge.x)}px`;
  btn.style.top = `${Math.round(badge.y)}px`;
  btn.style.width = `${Math.round(badge.width)}px`;
  btn.style.height = `${Math.round(badge.height)}px`;
  tooltip(btn, 'Familie öffnen');
  btn.textContent = '⚭';
  btn.addEventListener('click', () => onSelectFamily(badge.familyId));
  ctx.wrap.appendChild(btn);
}
