// tests/core/hof-umzug.test.ts — Hof an ein anderes Dorf hängen (ADR-v9-172, Spec 11 §1).
//
// Die Hof-Identität ist `(villageId, normalisierte Adresse)` — ein Dorfwechsel ist deshalb
// kein Feld-Setzer, sondern ein Identitätswechsel mit zwei Nachläufen. Dieser Test deckt
// den Kern-Anteil ab; den Ereignis-Anteil (`event.placeId`) prüft tests/services.
import { describe, expect, it } from 'vitest';
import { moveHofToVillage } from '../../core/places';
import { hof, hofMap } from './places-fixtures';

const adresse = (v: string) => [{ value: v, lang: 'deu', from: null, to: null, dateRaw: null }];

describe('moveHofToVillage', () => {
  it('hängt den Hof an das neue Dorf', () => {
    const hofs = hofMap(hof('_hof_wall33_@P1@', '@P1@', { addrs: adresse('Wall 33') }));
    const r = moveHofToVillage(hofs, '_hof_wall33_@P1@', '@P2@');
    expect(hofs.get('_hof_wall33_@P1@')?.villageId).toBe('@P2@');
    expect(r.merged).toBe(0);
    expect(r.hofId).toBe('_hof_wall33_@P1@');
  });

  it('behält die Id — sie ist ein Schlüssel, kein Datum', () => {
    // `_hof_<addr>_<village>` trägt das Dorf im Namen, wird aber nirgends geparst. Sie
    // mitzuwandern hieße, jede event.hofId-Referenz umzuhängen, ohne Gewinn.
    const hofs = hofMap(hof('_hof_wall33_@P1@', '@P1@', { addrs: adresse('Wall 33') }));
    moveHofToVillage(hofs, '_hof_wall33_@P1@', '@P2@');
    expect([...hofs.keys()]).toEqual(['_hof_wall33_@P1@']);
  });

  it('konsolidiert bei Adress-Kollision im Zieldorf verlustfrei', () => {
    // DER kritische Fall: zwei Höfe gleicher Adresse im selben Dorf machen `findByAddr`
    // mehrdeutig (`null` bei ≥2 Kandidaten) — zuvor eindeutige Ereignisse kippten in
    // Review-Klasse C. Exakt die Regression aus ADR-v9-45s Nachtrag, dieselbe Antwort.
    const hofs = hofMap(
      hof('_hof_wall33_@P1@', '@P1@', { addrs: adresse('Wall 33'), note: 'aus Dorf 1' }),
      hof('_hof_wall33_@P2@', '@P2@', { addrs: adresse('Wall 33'), lat: 52.1, long: 7.1 }),
    );
    const r = moveHofToVillage(hofs, '_hof_wall33_@P1@', '@P2@');

    expect(r.merged).toBe(1);
    expect(hofs.size).toBe(1);
    const ueberlebender = [...hofs.values()][0];
    expect(ueberlebender.villageId).toBe('@P2@');
    // Verlustfrei: Notiz UND Koordinaten des jeweils anderen sind erhalten.
    expect(ueberlebender.note).toBe('aus Dorf 1');
    expect(ueberlebender.lat).toBe(52.1);
  });

  it('meldet die Gewinner-Id, wenn der umgezogene Hof selbst konsolidiert wurde', () => {
    // Die View muss danach umschalten — sonst zeigt sie auf einen Hof, den es nicht mehr gibt.
    const hofs = hofMap(
      hof('_hof_a_@P1@', '@P1@', { addrs: adresse('Wall 33') }),
      hof('_hof_a_@P2@', '@P2@', { addrs: adresse('Wall 33'), note: 'älter' }),
    );
    const r = moveHofToVillage(hofs, '_hof_a_@P1@', '@P2@');
    expect(hofs.has(r.hofId)).toBe(true);
    expect(r.remap.size).toBeGreaterThan(0);
  });

  it('fasst verschiedene Adressen im Zieldorf NICHT zusammen', () => {
    const hofs = hofMap(
      hof('_hof_wall33_@P1@', '@P1@', { addrs: adresse('Wall 33') }),
      hof('_hof_schulze_@P2@', '@P2@', { addrs: adresse('Schulze-Hof') }),
    );
    const r = moveHofToVillage(hofs, '_hof_wall33_@P1@', '@P2@');
    expect(r.merged).toBe(0);
    expect(hofs.size).toBe(2);
  });

  it('ist ein No-op bei gleichem Dorf, fehlendem Hof oder leerer Ziel-Id', () => {
    const hofs = hofMap(hof('_hof_a_@P1@', '@P1@', { addrs: adresse('Wall 33') }));
    expect(moveHofToVillage(hofs, '_hof_a_@P1@', '@P1@').merged).toBe(0);
    expect(moveHofToVillage(hofs, '_gibt_es_nicht', '@P2@').merged).toBe(0);
    expect(moveHofToVillage(hofs, '_hof_a_@P1@', '' as never).merged).toBe(0);
    expect(hofs.get('_hof_a_@P1@')?.villageId).toBe('@P1@');
  });
});
