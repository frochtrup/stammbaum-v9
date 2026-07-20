// core/validate/index.ts — öffentliche API der Validierungs-Engine (Spec 20 §3).
// Eine Engine, zwei Konsumenten: „✓ Daten prüfen" (§1.11h) und das Qualitäts-Dashboard
// (§1.11g, BL-05).
export type {
  Finding,
  Hit,
  Rule,
  RuleContext,
  RuleGroup,
  RuleId,
  Severity,
  StoredValidationConfig,
  TaskCategory,
  ThresholdKey,
  Thresholds,
  ValidationConfig,
} from './types';

export { RULES, RULES_BY_ID } from './rules';
export {
  configFromStored,
  configToStored,
  defaultConfig,
  defaultDisabled,
  defaultThresholds,
} from './config';
export { runValidation, countBySeverity, sortFindings, withoutAlreadyTasked } from './run';
export { buildContext, reachableFrom, hofsWithResidence } from './context';
export { distanceKm } from './geo';
export { buildQualityDashboard, filterFocus } from './dashboard';
export type {
  DashboardOptions,
  FocusFilter,
  FocusPerson,
  FocusRow,
  QualityDashboard,
  RadarBar,
} from './dashboard';
