// @vitest-environment happy-dom
// tests/ui/shortcuts.test.ts — Tastenkürzel-Zuordnung der Schale (BL-01: Undo/Redo).
import { describe, expect, it } from 'vitest';
import { matchShortcut, isEditableTarget, belongsToField } from '../../ui/shell/shortcuts';

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

describe('matchShortcut — Speichern, Palette, Escape (BL-08/BL-93)', () => {
  const key = (init: Partial<KeyboardEvent> & { key: string }) =>
    new KeyboardEvent('keydown', init as KeyboardEventInit);

  it('erkennt Speichern auf beiden Plattform-Modifiern', () => {
    expect(matchShortcut(key({ key: 's', metaKey: true }))).toBe('save');
    expect(matchShortcut(key({ key: 'S', ctrlKey: true }))).toBe('save');
  });

  it('erkennt die Befehlspalette', () => {
    expect(matchShortcut(key({ key: 'k', metaKey: true }))).toBe('palette');
    expect(matchShortcut(key({ key: 'K', ctrlKey: true }))).toBe('palette');
  });

  it('erkennt Escape OHNE Modifier — sonst fiele es durch die Modifier-Schranke', () => {
    expect(matchShortcut(key({ key: 'Escape' }))).toBe('escape');
    // Auch mit Modifier bleibt Escape Escape: ein versehentlich gehaltenes Cmd soll das
    // Schließen nicht verhindern.
    expect(matchShortcut(key({ key: 'Escape', metaKey: true }))).toBe('escape');
  });

  it('bleibt bei unbelegten Tasten still', () => {
    expect(matchShortcut(key({ key: 'p', metaKey: true }))).toBeNull();
    expect(matchShortcut(key({ key: 's' }))).toBeNull();
  });
});

describe('belongsToField — welches Kürzel dem Eingabefeld gehört', () => {
  it('überlässt dem Feld nur Undo/Redo', () => {
    expect(belongsToField('undo')).toBe(true);
    expect(belongsToField('redo')).toBe(true);
  });

  it('lässt Escape, Speichern und Palette AUCH im Feld greifen', () => {
    // Der Kern der Unterscheidung: ein Escape, das ein Overlay nicht schließt, weil der
    // Fokus in dessen eigenem Suchfeld steht, wäre ein Keyboard-Trap (LP-8, §6i).
    expect(belongsToField('escape')).toBe(false);
    expect(belongsToField('save')).toBe(false);
    expect(belongsToField('palette')).toBe(false);
  });
});
