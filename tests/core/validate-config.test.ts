// Konfiguration + `known`-Vererbung (Spec 20 §3 „Konfiguration").
//
// Das ist der Teil, der still falsch sein kann: eine kaputte Vererbung fällt erst
// Monate später auf — nämlich dann, wenn eine NEUE opt-in-Regel bei Bestandsnutzern
// nach einem App-Update unangekündigt Befunde erzeugt.
import { describe, expect, it } from 'vitest';
import {
  configFromStored,
  configToStored,
  defaultConfig,
  defaultThresholds,
  RULES,
  type RuleId,
  type StoredValidationConfig,
} from '../../core/validate/index';

/** Ein gespeicherter Stand, der die genannten Regeln noch nicht kannte. */
function storedWithout(unknownIds: RuleId[], patch: Partial<StoredValidationConfig> = {}): StoredValidationConfig {
  return {
    disabled: [],
    thresholds: {},
    known: RULES.map((r) => r.id).filter((id) => !unknownIds.includes(id)),
    ...patch,
  };
}

describe('Auslieferungszustand', () => {
  it('schaltet genau die opt-in-Regeln ab (MISSING_EVAL, OPEN_HYPO)', () => {
    expect([...defaultConfig().disabled].sort()).toEqual(['MISSING_EVAL', 'OPEN_HYPO']);
  });

  it('leitet die Abschaltliste aus der Registry ab, nicht aus einer zweiten Liste', () => {
    const fromRegistry = RULES.filter((r) => !r.defaultEnabled).map((r) => r.id).sort();
    expect([...defaultConfig().disabled].sort()).toEqual(fromRegistry);
  });

  it('nutzt die Spec-Schwellen, nicht die abweichenden v8-Code-Werte (ADR-v9-96)', () => {
    const t = defaultThresholds();
    expect(t.minMotherAge).toBe(14);
    expect(t.maxMotherAge).toBe(55);
    expect(t.minFatherAge).toBe(14);
    expect(t.maxFatherAge).toBe(80);
  });
});

describe('known-Vererbung', () => {
  it('eine Regel, die der gespeicherte Stand nicht kannte, erbt ihren Default', () => {
    // Nutzer hatte alles aktiv; OPEN_HYPO kam erst danach als opt-in-Regel dazu.
    const cfg = configFromStored(storedWithout(['OPEN_HYPO']));
    expect(cfg.disabled.has('OPEN_HYPO')).toBe(true);
  });

  it('eine bekannte, bewusst EINGESCHALTETE opt-in-Regel bleibt eingeschaltet', () => {
    // Der Nutzer hat MISSING_EVAL kannte und aktiv gelassen — das darf die Vererbung
    // nicht überschreiben, sonst wäre die Regel dauerhaft nicht aktivierbar.
    const stored: StoredValidationConfig = {
      disabled: [],
      thresholds: {},
      known: RULES.map((r) => r.id),
    };
    expect(configFromStored(stored).disabled.has('MISSING_EVAL')).toBe(false);
  });

  it('eine bewusst ABGESCHALTETE Standard-Regel bleibt abgeschaltet', () => {
    const stored: StoredValidationConfig = {
      disabled: ['MISSING_SEX'],
      thresholds: {},
      known: RULES.map((r) => r.id),
    };
    expect(configFromStored(stored).disabled.has('MISSING_SEX')).toBe(true);
  });

  it('eine neu hinzugekommene STANDARD-Regel bleibt aktiv', () => {
    // Gegenprobe zur ersten Zusicherung: die Vererbung darf nicht pauschal alles
    // Unbekannte abschalten, sondern nur das, dessen Default „aus" ist.
    const cfg = configFromStored(storedWithout(['MISSING_SEX']));
    expect(cfg.disabled.has('MISSING_SEX')).toBe(false);
  });

  it('verwirft IDs entfernter/umbenannter Regeln', () => {
    const stored: StoredValidationConfig = {
      disabled: ['REGEL_GIBT_ES_NICHT_MEHR'],
      thresholds: {},
      known: RULES.map((r) => r.id),
    };
    expect([...configFromStored(stored).disabled]).toEqual([]);
  });

  it('ohne gespeicherten Stand gilt der Auslieferungszustand', () => {
    expect([...configFromStored(null).disabled].sort()).toEqual(['MISSING_EVAL', 'OPEN_HYPO']);
  });
});

describe('Schwellenwerte', () => {
  it('übernimmt gespeicherte Werte und erbt fehlende vom Default', () => {
    const cfg = configFromStored(storedWithout([], { thresholds: { maxAge: 95 } }));
    expect(cfg.thresholds.maxAge).toBe(95);
    expect(cfg.thresholds.staStAera).toBe(defaultThresholds().staStAera);
  });

  it('ignoriert unbrauchbare Werte statt NaN in die Engine zu lassen', () => {
    const cfg = configFromStored(
      storedWithout([], { thresholds: { maxAge: NaN } as Record<string, number> }),
    );
    expect(cfg.thresholds.maxAge).toBe(defaultThresholds().maxAge);
  });
});

describe('Rundlauf', () => {
  it('speichert IMMER den vollständigen Regelstand als known', () => {
    // Ohne das könnte ein späterer Ladevorgang „neu hinzugekommen" nicht erkennen.
    expect(configToStored(defaultConfig()).known.sort()).toEqual(RULES.map((r) => r.id).sort());
  });

  it('speichern → laden erhält die Nutzer-Entscheidungen unverändert', () => {
    const cfg = defaultConfig();
    const eigene = {
      ...cfg,
      disabled: new Set<RuleId>(['MISSING_SEX']),
      thresholds: { ...cfg.thresholds, maxAge: 99 },
    };
    const wieder = configFromStored(configToStored(eigene));
    expect([...wieder.disabled]).toEqual(['MISSING_SEX']);
    expect(wieder.thresholds.maxAge).toBe(99);
    // MISSING_EVAL war bekannt und eingeschaltet — bleibt eingeschaltet.
    expect(wieder.disabled.has('MISSING_EVAL')).toBe(false);
  });
});
