// @vitest-environment happy-dom
// tests/ui/shortcuts.test.ts — Tastenkürzel-Zuordnung der Schale (BL-01: Undo/Redo).
import { describe, expect, it } from 'vitest';
import { matchShortcut, isEditableTarget } from '../../ui/shell/shortcuts';

const key = (init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent =>
  new KeyboardEvent('keydown', init);

describe('matchShortcut', () => {
  it('⌘Z und Strg+Z lösen undo aus', () => {
    expect(matchShortcut(key({ key: 'z', metaKey: true }))).toBe('undo');
    expect(matchShortcut(key({ key: 'z', ctrlKey: true }))).toBe('undo');
  });

  it('⇧⌘Z und Strg+Umschalt+Z lösen redo aus', () => {
    expect(matchShortcut(key({ key: 'z', metaKey: true, shiftKey: true }))).toBe('redo');
    expect(matchShortcut(key({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('redo');
  });

  it('akzeptiert Großschreibung (⇧ ändert key auf "Z")', () => {
    expect(matchShortcut(key({ key: 'Z', metaKey: true, shiftKey: true }))).toBe('redo');
  });

  it('ignoriert Z ohne Modifier — sonst wäre kein Buchstabe mehr tippbar', () => {
    expect(matchShortcut(key({ key: 'z' }))).toBeNull();
  });

  it('ignoriert andere Tasten und Alt-Kombinationen', () => {
    expect(matchShortcut(key({ key: 'y', metaKey: true }))).toBeNull();
    expect(matchShortcut(key({ key: 'z', metaKey: true, altKey: true }))).toBeNull();
  });
});

describe('isEditableTarget — ⌘Z gehört im Eingabefeld dem Feld', () => {
  it('erkennt input/textarea/select', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isEditableTarget(document.createElement(tag))).toBe(true);
    }
  });

  it('erkennt contenteditable', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    document.body.append(el);
    expect(isEditableTarget(el)).toBe(true);
    el.remove();
  });

  it('gewöhnliche Elemente und null sind nicht editierbar', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
