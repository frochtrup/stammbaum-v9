// ui/views/story/story-epochs.ts — Epochen-Kontext des Story-Modus (BL-184, Spec 20 §1.10).
// Reine Referenzdaten (deutschsprachiger Raum) + reiner Selektor — headless testbar.
// Verhaltens-Orakel: v8 `legacy-v8/story-epochs.js` (`_STORY_EPOCHS`, 1:1 übernommen) und
// `legacy-v8/ui-story-person.js` (`_sectionEpoch`-Auswahl).
//
// BEWUSST ein eigener Datensatz, getrennt von `HIST_EVENTS` (Zeitleisten-Punktereignisse,
// ui/islands/timeline/historical-events.ts) und `MIGRATION_EPOCHS` (Karten-Farb-Buckets,
// ui/islands/map/map-model.ts): Epochen sind Zeit-SPANNEN mit erzählendem Kontext-Satz,
// keine Punkte und keine Farbskala. Drei Fragen, drei Tabellen (Spec 20 §1.10).

export interface StoryEpoch {
  from: number;
  to: number;
  /** Kurzname (Nominativ) für Listen. */
  label: string;
  /** Genitiv-Form für „in der Zeit …". */
  gen: string;
  /** Kontext-Satz der Epoche. */
  ctx: string;
}

export const STORY_EPOCHS: readonly StoryEpoch[] = [
  { from: 1618, to: 1648, label: 'Dreißigjähriger Krieg', gen: 'des Dreißigjährigen Krieges',
    ctx: 'Krieg, Seuchen und Hungersnöte verwüsteten weite Teile Mitteleuropas.' },
  { from: 1789, to: 1815, label: 'Napoleonische Ära', gen: 'der Napoleonischen Ära',
    ctx: 'Die Napoleonischen Kriege veränderten die politische Landkarte Europas grundlegend.' },
  { from: 1848, to: 1849, label: 'Revolutionszeit 1848/49', gen: 'der Revolutionszeit 1848/49',
    ctx: 'Forderungen nach nationaler Einheit und bürgerlichen Freiheiten erschütterten die alten Mächte.' },
  { from: 1866, to: 1866, label: 'Deutschen Krieg (1866)', gen: 'des Deutschen Krieges (1866)',
    ctx: 'Der Krieg zwischen Preußen und Österreich entschied die Vorherrschaft im deutschen Raum.' },
  { from: 1870, to: 1871, label: 'Deutsch-Französischer Krieg', gen: 'des Deutsch-Französischen Krieges',
    ctx: 'Der Sieg über Frankreich ebnete den Weg zur Gründung des Deutschen Kaiserreichs.' },
  { from: 1871, to: 1918, label: 'Deutsches Kaiserreich', gen: 'des Deutschen Kaiserreichs',
    ctx: 'Industrialisierung, wirtschaftliches Wachstum und Aufbruch in die Moderne prägten diese Ära.' },
  { from: 1914, to: 1918, label: 'Erster Weltkrieg', gen: 'des Ersten Weltkriegs',
    ctx: 'Der Erste Weltkrieg kostete Millionen das Leben und erschütterte die alte europäische Ordnung.' },
  { from: 1918, to: 1933, label: 'Weimarer Republik', gen: 'der Weimarer Republik',
    ctx: 'Demokratischer Neuanfang, Hyperinflation und politische Unruhen wechselten einander ab.' },
  { from: 1933, to: 1945, label: 'NS-Zeit', gen: 'der NS-Zeit',
    ctx: 'Die nationalsozialistische Diktatur brachte Terror, Verfolgung und schließlich den Krieg.' },
  { from: 1939, to: 1945, label: 'Zweiter Weltkrieg', gen: 'des Zweiten Weltkriegs',
    ctx: 'Der Zweite Weltkrieg war der verlustreichste Krieg der Geschichte und hinterließ Europa in Trümmern.' },
  { from: 1949, to: 1990, label: 'Geteiltes Deutschland', gen: 'des geteilten Deutschlands',
    ctx: 'Deutschland war in Bundesrepublik im Westen und DDR im Osten geteilt.' },
];

function epochLabel(e: StoryEpoch): string {
  return `${e.gen} (${e.from === e.to ? e.from : e.from + '–' + e.to})`;
}

/**
 * Epochen-Kontext-Satz für eine Lebensspanne (Orakel `_sectionEpoch`). Wählt bis zu drei
 * überlappende Epochen für die Aufzählung und hängt den Kontext-Satz der Epoche mit dem
 * GRÖSSTEN Lebens-Überlapp (aus den angezeigten) an. `subject` ist „Er"/„Sie"/Vorname
 * (aus `pronoun(p).Er`). Reiner Text, '' wenn keine Datierung oder keine Epoche greift.
 * Fehlt das Sterbejahr, wird `birthYear + 80` angenommen (wie im Orakel).
 */
export function epochContext(birthYear: number | null, deathYear: number | null, subject: string): string {
  if (!birthYear && !deathYear) return '';
  const lifeStart = birthYear || 0;
  const lifeEnd = deathYear || (birthYear ? birthYear + 80 : 9999);
  const matches = STORY_EPOCHS.filter((e) => e.from <= lifeEnd && e.to >= lifeStart);
  if (!matches.length) return '';

  const top = matches.slice(0, 3);
  let sentence: string;
  if (top.length === 1) {
    sentence = `${subject} lebte in der Zeit ${epochLabel(top[0])}.`;
  } else {
    const last = top[top.length - 1];
    const rest = top.slice(0, -1);
    sentence = `${subject} lebte in der Zeit ${rest.map(epochLabel).join(', ')} und ${epochLabel(last)}.`;
  }

  const ctxEpoch = top.reduce<StoryEpoch | null>((best, e) => {
    if (!e.ctx) return best;
    if (!best) return e;
    const overlap = Math.min(lifeEnd, e.to) - Math.max(lifeStart, e.from);
    const bestOverlap = Math.min(lifeEnd, best.to) - Math.max(lifeStart, best.from);
    return overlap > bestOverlap ? e : best;
  }, null);
  if (ctxEpoch?.ctx) sentence += ' ' + ctxEpoch.ctx;
  return sentence;
}
