// services/undo/index.ts — öffentliche API des Undo/Redo-Dienstes (Spec 20 §1.2, ADR-v9-92).

export { createUndoStack, DEFAULT_UNDO_LIMIT } from './undo-stack';
export type { UndoStack } from './undo-stack';
