// tests/ui/all-events.test.ts — collectAllEvents (ui/shell/all-events.ts): flache
// Event-Sammlung über Personen/Familien, Grundlage für hasReference/Massen-Dedup (Spec
// 11 §9). Reine Funktion (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../core/model';
import { collectAllEvents } from '../../ui/shell/all-events';

describe('collectAllEvents — flache Event-Liste über Personen + Familien', () => {
  it('leere Datenbank → leere Event-Liste', () => {
    expect(collectAllEvents(makeDatabase())).toEqual([]);
  });

  it('sammelt Personen-Sonderereignisse (auch leere) + events[]', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@');
    p.events.push({ ...p.birth, type: 'OCCU' });
    db.individuals.set('@I1@', p);

    const events = collectAllEvents(db);

    // 4 Sonderereignisse (birth/chr/death/buri) + 1 generisches Event.
    expect(events).toHaveLength(5);
    expect(events).toContain(p.birth);
    expect(events).toContain(p.chr);
    expect(events).toContain(p.death);
    expect(events).toContain(p.buri);
    expect(events).toContain(p.events[0]);
  });

  it('sammelt Familien-Sonderereignisse (engagement/marriage) + events[]', () => {
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.events.push({ ...f.marriage, type: 'EVEN' });
    db.families.set('@F1@', f);

    const events = collectAllEvents(db);

    expect(events).toHaveLength(3);
    expect(events).toContain(f.engagement);
    expect(events).toContain(f.marriage);
    expect(events).toContain(f.events[0]);
  });

  it('kombiniert Personen UND Familien in einer flachen Liste', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    db.families.set('@F1@', makeFamily('@F1@'));

    expect(collectAllEvents(db)).toHaveLength(4 + 2);
  });
});
