/**
 * Light, dark, or whatever the reader's system says.
 *
 * Three states rather than two. "System" is the default and is a real choice
 * the reader can come back to, not just the absence of one -- a two-state
 * toggle has to pick a starting value, and picks wrong for everybody whose OS
 * is already set the way they want it.
 *
 * The mechanism is one attribute on `<html>`: absent means the stylesheet's
 * `prefers-color-scheme` block decides, and `light`/`dark` pin it. See the
 * `[data-theme]` blocks in app.scss.
 */

const KEY = 'theme';

/** @typedef {'system'|'light'|'dark'} Choice */

/** The order the toggle cycles through. */
const ORDER = /** @type {Choice[]} */ (['system', 'light', 'dark']);

const LABELS = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
};

/**
 * Read the stored choice.
 *
 * Anything unrecognised becomes 'system' rather than throwing: this is
 * localStorage, which any extension or an older build of this app may have
 * written to, and a theme is not worth an error boundary.
 */
function stored() {
  try {
    const raw = localStorage.getItem(KEY);
    return ORDER.includes(raw) ? raw : 'system';
  } catch {
    // Private mode, or storage disabled entirely. Follow the system and forget.
    return 'system';
  }
}

class Theme {
  /** @type {Choice} */
  choice = $state('system');

  /** What to call the current setting, for a control that announces itself. */
  label = $derived(LABELS[this.choice]);

  /**
   * Whether dark is what the reader is actually seeing right now.
   *
   * Needed for the control's icon, which has to reflect the rendered theme
   * rather than the setting -- under 'system' the setting says nothing about
   * which one is on screen.
   */
  isDark = $derived.by(() => {
    if (this.choice !== 'system') return this.choice === 'dark';
    return this.systemPrefersDark;
  });

  /** Kept in sync with the media query, so 'system' re-renders when the OS flips. */
  systemPrefersDark = $state(false);

  /** Read storage, apply, and start following the OS. Call once at boot. */
  start() {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    this.systemPrefersDark = Boolean(query?.matches);
    query?.addEventListener?.('change', (e) => { this.systemPrefersDark = e.matches; });

    this.choice = stored();
    this.#apply();
  }

  /** @param {Choice} choice */
  set(choice) {
    this.choice = ORDER.includes(choice) ? choice : 'system';
    try {
      // 'system' is stored as an absence, so a reader who picks it goes back to
      // being indistinguishable from one who never chose -- including if the
      // default ever changes.
      if (this.choice === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, this.choice);
    } catch { /* nothing to do; the choice still holds for this page */ }
    this.#apply();
  }

  /** Advance to the next setting, for a single-button control. */
  cycle() {
    this.set(ORDER[(ORDER.indexOf(this.choice) + 1) % ORDER.length]);
  }

  #apply() {
    const root = document.documentElement;
    if (this.choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', this.choice);
  }
}

export const theme = new Theme();
export { ORDER as THEME_ORDER, LABELS as THEME_LABELS };
