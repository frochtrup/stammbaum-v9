// core/validate/config.ts — Defaults und `known`-Vererbung der Regel-Konfiguration
// (Spec 20 §3 „Konfiguration"). Reine Funktionen, keine Persistenz — der Speicher
// liegt in services/validate (IndexedDB, ADR-v9-96).
import { RULES } from './rules';
import type { RuleId, StoredValidationConfig, Thresholds, ValidationConfig } from './types';

/**
 * Schwellenwert-Defaults.
 *
 * WICHTIG — Abweichung vom v8-Code, bewusst (ADR-v9-96): Spec 20 §3 bezeichnet diese
 * Werte als „v8-Defaults", vier davon weichen aber vom echten `VAL_CONFIG_DEFAULTS`
 * in legacy-v8/gedcom-validator.js ab (dort: minMotherAge 12, maxMotherAge 60,
 * maxFatherAge 90, minFatherAge 15). v9 folgt hier der Spec, nicht dem Orakel — die
 * strengeren Grenzen sind die gewollten. Alle Werte sind ohnehin editierbar.
 */
export function defaultThresholds(): Thresholds {
  return {
    maxAge: 110,
    staStAera: 1876,
    minMotherAge: 14,
    maxMotherAge: 55,
    minFatherAge: 14,
    maxFatherAge: 80,
    minMarrAge: 14,
    maxChildren: 15,
    hofMaxDistKm: 25,
    // Europa + angrenzende Regionen (v8-Orakel `_GEO_BBOX`, ui-views-place.js).
    bboxMinLat: 27,
    bboxMaxLat: 72,
    bboxMinLon: -25,
    bboxMaxLon: 50,
  };
}

/** IDs der ab Werk deaktivierten Regeln — aus der Registry abgeleitet, nicht gepflegt. */
export function defaultDisabled(): Set<RuleId> {
  return new Set(RULES.filter((r) => !r.defaultEnabled).map((r) => r.id));
}

/** Frische Konfiguration im Auslieferungszustand. */
export function defaultConfig(): ValidationConfig {
  return {
    disabled: defaultDisabled(),
    thresholds: defaultThresholds(),
    probandId: null,
  };
}

/**
 * Gespeicherten Stand in eine Laufzeit-Konfiguration überführen — hier lebt die
 * `known`-Vererbung (Spec 20 §3).
 *
 * Der Vertrag: eine Regel, die der gespeicherte Stand noch NICHT kannte (nicht in
 * `known`), übernimmt ihren `defaultEnabled`-Wert. Nur so bleibt eine später ergänzte
 * opt-in-Regel bei Bestandsnutzern nach einem App-Update aus, statt unangekündigt
 * Befunde zu erzeugen. Regeln, die `known` enthielt, behalten die Nutzer-Entscheidung —
 * auch dann, wenn der Nutzer sie bewusst ENTGEGEN dem Default gesetzt hat.
 *
 * Unbekannte IDs in `disabled` (Regel inzwischen entfernt/umbenannt) werden verworfen;
 * unbekannte Schwellen-Schlüssel ebenso, fehlende erben den Default.
 */
export function configFromStored(stored: StoredValidationConfig | null): ValidationConfig {
  if (!stored) return defaultConfig();

  const knownIds = new Set(stored.known ?? []);
  const validIds = new Set<string>(RULES.map((r) => r.id));
  const disabled = new Set<RuleId>(
    (stored.disabled ?? []).filter((id): id is RuleId => validIds.has(id)),
  );

  // Vererbung: was der gespeicherte Stand nicht kannte, folgt seinem Default.
  for (const rule of RULES) {
    if (!knownIds.has(rule.id) && !rule.defaultEnabled) disabled.add(rule.id);
  }

  const base = defaultThresholds();
  const thresholds = { ...base };
  for (const key of Object.keys(base) as (keyof Thresholds)[]) {
    const v = stored.thresholds?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) thresholds[key] = v;
  }

  return { disabled, thresholds, probandId: null };
}

/**
 * Laufzeit-Konfiguration in die speicherbare Form bringen. `known` ist IMMER der
 * vollständige aktuelle Regelstand — das ist der Anker, gegen den ein künftiger
 * `configFromStored`-Aufruf „neu hinzugekommen" überhaupt erst erkennen kann.
 */
export function configToStored(cfg: ValidationConfig): StoredValidationConfig {
  return {
    disabled: [...cfg.disabled],
    thresholds: { ...cfg.thresholds },
    known: RULES.map((r) => r.id),
  };
}
