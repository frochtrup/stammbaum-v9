// tests/core/enum-maps.test.ts — gebündelte, beidseitige Enum-/Wert-Abbildungen (BL-156,
// ADR-v9-127). Gate laut DoD: jede Enum-Abbildung hin↔zurück stabil auf den bekannten
// Werten; unbekannter Wert wird DEFINIERT behandelt (kein stiller Datenverlust, LP-1-Geist).
// Reine, build-freie Kern-Tests (INV-ARCH-2).

import { describe, it, expect } from 'vitest';
import {
  grampsTypeToTag,
  tagToGrampsType,
  TAG_BY_GRAMPS,
  confidenceToQuay,
  quayToConfidence,
  pediToChildrefRel,
  childrefRelToPedi,
  normalizeMedi,
  MEDI_TYPES,
} from '../../core/interop/enum-maps';
import type { Quay } from '../../core/model/types';

// ── 1. Ereignistyp: GEDCOM-Tag ↔ GRAMPS-<type> ────────────────────────────────

describe('Ereignistyp GEDCOM-Tag ↔ GRAMPS-<type>', () => {
  it('jeder gemappte GRAMPS-Typ → Tag → GRAMPS-Typ ist stabil (Bijektion auf bekannten Werten)', () => {
    for (const [gramps, tag] of Object.entries(TAG_BY_GRAMPS)) {
      const { tag: t, eventType } = grampsTypeToTag(gramps);
      expect(t).toBe(tag);
      expect(eventType).toBe('');
      // Rückrichtung: Tag → derselbe GRAMPS-Typ.
      expect(tagToGrampsType(t, eventType)).toBe(gramps);
    }
  });

  it('unbekannter/deutscher GRAMPS-Typ → EVEN + wörtlicher eventType, verlustfrei zurück', () => {
    const { tag, eventType } = grampsTypeToTag('Erstkommunion');
    expect(tag).toBe('EVEN');
    expect(eventType).toBe('Erstkommunion');
    expect(tagToGrampsType(tag, eventType)).toBe('Erstkommunion');
  });

  it('EVEN/FACT ohne eventType → generischer GRAMPS-Typ "Event" (kein leerer <type>)', () => {
    expect(tagToGrampsType('EVEN', '')).toBe('Event');
    expect(tagToGrampsType('FACT', '')).toBe('Event');
  });

  it('unbekannter GEDCOM-Tag ohne Mapping → fällt auf eventType, ersatzweise Tag zurück', () => {
    expect(tagToGrampsType('BAPL', '')).toBe('BAPL');
    expect(tagToGrampsType('BAPL', 'Endowment')).toBe('Endowment');
  });
});

// ── 2. QUAY ↔ GRAMPS-<confidence> ─────────────────────────────────────────────

describe('QUAY ↔ GRAMPS-<confidence>', () => {
  it('confidence 0–3 → QUAY identisch, hin↔zurück stabil', () => {
    for (let q = 0; q <= 3; q++) {
      expect(confidenceToQuay(String(q))).toBe(q as Quay);
      expect(quayToConfidence(q as Quay)).toBe(String(q));
      expect(confidenceToQuay(quayToConfidence(q as Quay))).toBe(q as Quay);
    }
  });

  it('confidence 4 (Very High) → QUAY 3 (dokumentierter Verlust D4: min(·,3))', () => {
    expect(confidenceToQuay('4')).toBe(3);
    // quay kann 4 nie erzeugen — die Rückrichtung ist informationsärmer, definiert.
    expect(quayToConfidence(3)).toBe('3');
  });

  it('leer/negativ/nichtnumerisch → QUAY 0 (definierter Default, kein NaN)', () => {
    expect(confidenceToQuay('')).toBe(0);
    expect(confidenceToQuay('-1')).toBe(0);
    expect(confidenceToQuay('xyz')).toBe(0);
  });
});

// ── 3. PEDI ↔ GRAMPS-childref-Relation (frel/mrel) ────────────────────────────

describe('PEDI ↔ GRAMPS-childref-Relation', () => {
  const roundtrip: Array<['birth' | 'adopted' | 'foster' | 'sealing', string]> = [
    ['birth', 'Birth'],
    ['adopted', 'Adopted'],
    ['foster', 'Foster'],
    ['sealing', 'Sealing'],
  ];

  it('jedes PEDI-Enum → childref-Relation → PEDI ist stabil', () => {
    for (const [pedi, rel] of roundtrip) {
      expect(pediToChildrefRel(pedi)).toBe(rel);
      expect(childrefRelToPedi(rel)).toBe(pedi);
    }
  });

  it('leeres PEDI ↔ leere Relation', () => {
    expect(pediToChildrefRel('')).toBe('');
    expect(childrefRelToPedi('')).toBe('');
  });

  it('deutsche/alternative GRAMPS-Relationen → PEDI-Enum (aus _FREL/_MREL-Lehre)', () => {
    expect(childrefRelToPedi('Geburt')).toBe('birth');
    expect(childrefRelToPedi('leiblich')).toBe('birth');
    expect(childrefRelToPedi('Adoptiv')).toBe('adopted');
    expect(childrefRelToPedi('Pflege')).toBe('foster');
    expect(childrefRelToPedi('natural')).toBe('birth');
  });

  it('unbekannte GRAMPS-Relation (Stepchild/Sponsored/…) → leeres PEDI (definiert, kein Rateversuch)', () => {
    expect(childrefRelToPedi('Stepchild')).toBe('');
    expect(childrefRelToPedi('Sponsored')).toBe('');
    expect(childrefRelToPedi('Unknown')).toBe('');
  });
});

// ── 4. MEDI (GEDCOM-Medientyp-Enum) ───────────────────────────────────────────

describe('MEDI (GEDCOM-Medientyp)', () => {
  it('bekannte MEDI-Werte werden kanonisch (lowercase) normalisiert, hin↔zurück stabil', () => {
    for (const v of MEDI_TYPES) {
      expect(normalizeMedi(v)).toBe(v);
      expect(normalizeMedi(v.toUpperCase())).toBe(v);
      expect(normalizeMedi(normalizeMedi(v))).toBe(v);
    }
  });

  it('unbekannter MEDI-Wert wird VERLUSTFREI durchgereicht (getrimmt, nicht verworfen)', () => {
    expect(normalizeMedi('Familienbuch')).toBe('Familienbuch');
    expect(normalizeMedi('  scrapbook ')).toBe('scrapbook');
    expect(normalizeMedi('')).toBe('');
  });
});
