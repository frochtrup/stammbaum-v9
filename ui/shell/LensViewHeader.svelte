<script lang="ts">
  // ui/shell/LensViewHeader.svelte — DIE EINE Kopfzeile für jede Lens-Ansicht
  // (Baum/Karte/Zeitleiste[folgt]/Story[folgt], Spec 21 §4, INV-UI-3).
  //
  // Befund (Browser-Verifikation Baum+Karte): beide Lenses hatten je eine eigene
  // `__topbar`-Zeile mit reinem Titel-Text ÜBER dem Lens-Umschalter — redundant, denn
  // der Umschalter zeigt die aktive Lens bereits über das hervorgehobene Tab
  // (aria-current + Klasse). Das kostete unnötigen Vertikalraum (Mobile-first) UND
  // war unabhängig dupliziertes Markup+CSS pro View (Baum-Topbar 26.6px hoch mit
  // Vollbild-Button, Karte-Topbar nur 18.5px ohne — liefen bei jeder künftigen
  // Änderung weiter auseinander).
  //
  // Diese Komponente ist die EINZIGE Quelle für Höhe/Padding/Ausrichtung der
  // Lens-Kopfzeile: sie rendert NUR den LensSwitcher. View-spezifische zweite Zeilen
  // (z. B. der Karten-Modus-Umschalter Orte/Personen/Migrationen) bleiben bewusst
  // AUSSERHALB — sie sind kein Lens-Wechsel, sondern ein View-internes Konzept, und
  // jede aufrufende View rendert sie direkt darunter.
  //
  // KEIN Aktions-Bereich mehr (BL-95): bis 2026-07-21 konnte eine Lens hier einen Knopf
  // neben den Umschalter hängen; genau das tat der Baum-Vollbild-Schalter und nahm der
  // Reihe 79 px, wodurch „Story" bei 375 px vollständig aus dem Bild rutschte. Der
  // Schalter sitzt jetzt in der Baum-Insel selbst — dort, wo er auch im Vollbild noch
  // erreichbar ist. Die Kopfzeile hat damit genau EINE Aufgabe, und die Reihe gehört ihr
  // allein. Braucht eine künftige Lens eine Aktion, gehört sie in deren Insel oder in
  // eine eigene Zeile darunter, nicht wieder neben die Segmente.
  import LensSwitcher from './LensSwitcher.svelte';
  import { layout } from './layout.svelte';
  import type { LensId } from './lens-model';

  interface Props {
    active: LensId;
    onNavigate: (lens: LensId) => void;
  }
  const { active, onNavigate }: Props = $props();
</script>

<!-- Spec 21 §4 nennt beide Formen als ENTWEDER-ODER: "Segment-Control (Mobile) bzw.
     Sidebar-Abschnitt ‚Ansichten' (Desktop)". Auf Desktop trägt die Sidebar die Lenses
     beschriftet und dauerhaft — der Umschalter hier wäre ein zweiter Mechanismus für
     denselben Wechsel (INV-UI-3) und ein zweiter Weg zum selben Ziel (INV-UI-2), genau
     wie die Entitäts-Segmentreihe in EntityTab.

     Die Hülle steht MIT im `{#if}`: seit sie nichts mehr außer dem Umschalter trägt,
     bliebe auf Desktop sonst ein leerer Streifen mit Trennlinie stehen (vor dem
     Padding-Abbau 33 px hoch, danach 1 px — beides Zierrat ohne Inhalt). -->
{#if !layout.isDesktopLayout}
  <div class="lens-view-header">
    <LensSwitcher {active} {onNavigate} />
  </div>
{/if}

<style>
  /* KEIN eigenes Padding: `.stb-segment-row` bringt seines mit (0.5rem 0.75rem). Vorher
     lag beides übereinander — die Lens-Pillen begannen bei x=24, die Entitäts-Pillen
     derselben App bei x=12, und der Reihe fehlten genau die 24 px, die sie für eine
     Zeile braucht (gemessen 375 px: 361 px Inhalt gegen 351 px Platz). Die Einrückung
     doppelt zu setzen war weder gewollt noch konsistent. */
  .lens-view-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .lens-view-header :global(.lens-switcher) {
    flex: 1;
    min-width: 0;
  }

</style>
