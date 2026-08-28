<script lang="ts">
  // ui/views/validation/ValConfigSheet.svelte — Regel-Konfiguration hinter EINEM
  // Einstiegspunkt (Spec 20 §1.11h: „seltene/schwere Interaktion, EIN Bottom-Sheet,
  // kein Dauer-Toolbar-Icon", INV-UI-11).
  //
  // Rendert Regeln UND Schwellen aus der Registry bzw. dem Thresholds-Typ — eine neue
  // Regel oder ein neuer Schwellenwert erscheint hier ohne Änderung an dieser Datei.
  //
  // OHNE COMMIT-PUNKT seit 2026-08-28 (Nutzer-Wunsch): jede Änderung wirkt sofort, wie
  // im Filter-Dialog nebenan. S. die Begründung an `onChange` unten.
  // Der Backdrop kommt aus `.stb-modal-backdrop` (design-system.css, INV-UI-4);
  // lokal bleibt nur das Panel.
  import { SvelteSet } from 'svelte/reactivity';
  import type { RuleId, Thresholds, ValidationConfig } from '../../../core/validate/index';
  import { defaultConfig } from '../../../core/validate/index';
  import { rulesByGroup, THRESHOLD_LABEL } from './validation-model';
  import { formSubmit } from '../../shell/form-keys';
  import { portal } from '../../shell/portal';
  import { focusTrap } from '../../shell/focus-trap';

  interface Props {
    config: ValidationConfig;
    /**
     * Jede Änderung SOFORT — es gibt kein „Speichern" mehr (Nutzer-Wunsch 2026-08-28:
     * „unmittelbar aktiv, auch bei Fokuswechsel, wie beim Filter-Dialog").
     *
     * Warum das die richtige Form ist und nicht bloß ein Klick weniger: die Fläche
     * beantwortet die Frage „welche Befunde will ich sehen" — dieselbe Frage wie die
     * `FilterBar` daneben, die seit jeher ohne Bestätigung auskommt (INV-UI-4: ein
     * Mechanismus, nicht pro Fläche neu erfunden). Ein Commit-Punkt ist dort richtig, wo
     * eine halb eingegebene Änderung Schaden anrichten kann (Ereignis-Editor,
     * [ADR-v9-168]); eine abgeschaltete Prüfregel richtet keinen an — sie ist jederzeit
     * zurückzunehmen, und die Wirkung ist unmittelbar sichtbar, was die beste Rückmeldung
     * ist, die eine Konfigurationsfläche geben kann.
     */
    onChange: (cfg: ValidationConfig) => void;
    onClose: () => void;
  }
  const { config, onChange, onClose }: Props = $props();

  // Anzeige-Zustand des Sheets. Jede Mutation reicht ihn über `melden()` sofort hoch —
  // eine Arbeitskopie im Sinne von „erst beim Speichern übernehmen" ist es seit dem
  // Wegfall des Commit-Punkts nicht mehr.
  //
  // Der Startwert wird weiterhin BEWUSST nur einmal aus `config` gelesen (Svelte warnt
  // vor `state_referenced_locally`): das Sheet hängt an einem `{#if}` im Aufrufer und
  // wird bei jedem Öffnen neu montiert. Ein `$derived` wäre auch jetzt falsch — der
  // Aufrufer schreibt `config` als Antwort auf unsere eigene Meldung zurück, und die
  // Rückschreibung würde den lokalen Stand mitten in der Eingabe ersetzen.
  // svelte-ignore state_referenced_locally
  const disabled = new SvelteSet<RuleId>(config.disabled);
  // svelte-ignore state_referenced_locally
  let thresholds = $state<Thresholds>({ ...config.thresholds });

  /** Den aktuellen Stand hochreichen — als gewöhnliches Set, der Kern kennt keine
   *  Svelte-Typen (INV-ARCH-1). */
  function melden(): void {
    onChange({ disabled: new Set(disabled), thresholds, probandId: config.probandId });
  }

  const groups = rulesByGroup();
  // Schlüssel aus der Prop, nicht aus der Arbeitskopie — die Menge der Schwellen ist
  // vom Typ vorgegeben und ändert sich zur Laufzeit nie.
  // svelte-ignore state_referenced_locally
  const thresholdKeys = Object.keys(config.thresholds) as (keyof Thresholds)[];

  function toggle(id: RuleId) {
    if (disabled.has(id)) disabled.delete(id);
    else disabled.add(id);
    melden();
  }

  /** Die Schwellen-Felder feuern `onchange`, also bei Enter ODER Verlassen des Feldes —
   *  genau das „auch bei Fokuswechsel" aus dem Nutzer-Wunsch. Ein `oninput` würde jeden
   *  Tastendruck melden und damit auch die Zwischenstände einer mehrstelligen Zahl. */
  function setThreshold(key: keyof Thresholds, raw: string) {
    const v = Number(raw);
    // Ungültige Eingabe stillschweigend verwerfen statt NaN in die Engine zu lassen —
    // die Anzeige behält dann den letzten gültigen Wert.
    if (!Number.isFinite(v)) return;
    thresholds = { ...thresholds, [key]: v };
    melden();
  }

  function allOn() {
    disabled.clear();
    melden();
  }

  function allOff() {
    for (const g of groups) for (const r of g.rules) disabled.add(r.id);
    melden();
  }

  function reset() {
    const d = defaultConfig();
    disabled.clear();
    for (const id of d.disabled) disabled.add(id);
    thresholds = { ...d.thresholds };
    melden();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- Portaliert (BL-278, INV-UI-13/§6k): §6k nennt Modal-Backdrops namentlich unter
     „Wer portaliert" — bis hierher taten es die vier Konsumenten als einzige nicht. Der
     Backdrop liegt `position: fixed`, das trug bisher; es trägt aber nur, solange KEIN
     Vorfahre `transform`/`filter`/`contain`/`will-change` setzt (dann wird er der
     Containing Block, und erst dann klippt auch sein `overflow: auto`). Diese Bedingung
     ist nichts, worauf eine Overlay-Fläche sich verlassen darf. -->
<div class="stb-modal-backdrop" use:portal use:focusTrap onclick={onClose} role="presentation">
  <div
    class="valcfg__panel"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Prüfregeln konfigurieren"
  >
  <!-- Der Inhalt ist ein `<form>` (BL-276, §6i): Escape schließt (svelte:window oben),
       Enter schließt ebenfalls — seit dem Wegfall des Commit-Punkts gibt es nichts mehr
       zu bestätigen, und ein Enter, das nichts tut, wäre die schlechtere Antwort als
       eines, das die Fläche verläßt. INNERHALB des Panels, nicht an seiner Stelle — die
       Dialog-Rolle kann ein `<form>` nicht tragen. -->
  <form class="valcfg__form" onsubmit={formSubmit(onClose)}>
    <div class="valcfg__head">
      <h3>Prüfregeln</h3>
      <button type="button" class="valcfg__close" onclick={onClose} aria-label="Schließen">✕</button>
    </div>

    <div class="valcfg__bulk">
      <button type="button" onclick={allOn}>Alle an</button>
      <button type="button" onclick={allOff}>Alle aus</button>
      <button type="button" onclick={reset}>Zurücksetzen</button>
    </div>

    {#each groups as group (group.group)}
      <h4 class="valcfg__group">{group.label}</h4>
      {#each group.rules as rule (rule.id)}
        <label class="valcfg__rule">
          <input
            type="checkbox"
            checked={!disabled.has(rule.id)}
            onchange={() => toggle(rule.id)}
          />
          <span>{rule.label}</span>
          {#if !rule.defaultEnabled}
            <span class="valcfg__optin" title="ab Werk deaktiviert">opt-in</span>
          {/if}
        </label>
      {/each}
    {/each}

    <h4 class="valcfg__group">Schwellenwerte</h4>
    {#each thresholdKeys as key (key)}
      <label class="valcfg__threshold">
        <span>{THRESHOLD_LABEL[key] ?? key}</span>
        <input
          type="number"
          value={thresholds[key]}
          onchange={(e) => setThreshold(key, (e.currentTarget as HTMLInputElement).value)}
        />
      </label>
    {/each}

    <!-- EIN Knopf, und der beendet nur die Fläche: jede Änderung oben wirkt bereits.
         „Abbrechen" gäbe es nichts mehr zurückzunehmen — der Knopf verspräche eine
         Rücknahme, die er nicht mehr leisten kann; „Zurücksetzen" oben ist der ehrliche
         Weg dorthin. -->
    <div class="valcfg__actions">
      <button type="submit" class="stb-btn" data-variant="primary">Fertig</button>
    </div>
  </form>
  </div>
</div>

<style>
  /* Reine Gruppierungs-Hülle im Panel (BL-276) — ändert dessen Fluss nicht. */
  .valcfg__form {
    display: contents;
  }

  .valcfg__panel {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    padding: 1rem;
    max-width: 32rem;
    width: 100%;
  }

  .valcfg__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .valcfg__head h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .valcfg__close {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .valcfg__bulk {
    display: flex;
    gap: 0.4rem;
    margin: 0.5rem 0;
  }

  .valcfg__bulk button,
  .valcfg__actions button {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
    color: var(--stb-text);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.25rem 0.6rem;
  }

  .valcfg__group {
    margin: 0.9rem 0 0.3rem;
    font-size: 0.8rem;
    color: var(--stb-gold-light);
  }

  .valcfg__rule {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    padding: 0.15rem 0;
  }

  .valcfg__optin {
    font-size: 0.7rem;
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
    padding: 0 0.3rem;
  }

  .valcfg__threshold {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.8rem;
    padding: 0.15rem 0;
  }

  .valcfg__threshold input {
    width: 6rem;
  }

  .valcfg__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

</style>
