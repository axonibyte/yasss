<script>
  /**
   * The navbar. docs/legacy/02-aesthetics.md §0.1.
   *
   * This used to carry an instruction not to add a hamburger, on the grounds
   * that the legacy markup had neither a burger nor a `navbar-menu` and that
   * adding one was a visible departure from main. That was right while the bar
   * held two items and the departure bought nothing. It now holds four plus a
   * theme control, which on a phone stacked into a column tall enough to push
   * the page content off screen — so the departure is the point, and it was
   * asked for.
   */
  import { theme } from '../state/theme.svelte.js';

  let {
    loggedIn = false, onCreatePoll,
    onCreateEvent, onTutorial, onLogin, onAccount, onLogout, onHome,
  } = $props();

  let menuOpen = $state(false);

  /**
   * Run a navbar action without letting the link navigate.
   *
   * Every item here is an `href="#thing"` anchor whose click handler opens a
   * modal, and none of them prevented the default — so each one pushed a
   * history entry like `?event=X#login`. Back then walked through a trail of
   * fragments that changed nothing visible, and on Chromium the resulting
   * `popstate` fired in the same tick as the click, which is a hazard the route
   * listener already has to work around.
   *
   * Closing the menu here rather than in each handler: on a phone the menu
   * covers the page, so leaving it open over whatever the item just opened is
   * the one thing every item would otherwise have to remember not to do.
   */
  const act = (fn) => (e) => {
    e.preventDefault();
    menuOpen = false;
    fn?.();
  };
</script>

<!-- legacy had role="navigation"; it is <nav>'s implicit role, so it is dropped -->
<nav class="navbar" aria-label="main navigation">
  <div class="navbar-brand">
    <!--
      `goHome()` existed and was never called: the brand was a plain `href="/"`,
      so the only way back to the dashboard was a full page reload — throwing
      away any unsaved work on the way. It navigates in-app now, and still
      behaves like a link for middle-click and open-in-new-tab, which is why it
      keeps its href.
    -->
    <a class="navbar-item" href="/" onclick={act(onHome)}>
      <img src="/assets/img/yasss_logo_small.png" alt="Yasss!" />
      <strong class="has-text-primary">Yasss!</strong>
    </a>

    <!--
      A real <button>, not Bulma's `<a role="button">`. The anchor form is not
      reachable by keyboard in any useful way — it has no href, so it is not a
      tab stop — and it lies about being a link when it toggles a disclosure.
      `aria-expanded` is the part a screen reader actually needs.
    -->
    <button
      type="button"
      class="navbar-burger"
      class:is-active={menuOpen}
      aria-label="Menu"
      aria-expanded={menuOpen}
      aria-controls="navbar-menu"
      data-testid="navbar-burger"
      onclick={() => { menuOpen = !menuOpen; }}
    >
      <span aria-hidden="true"></span>
      <span aria-hidden="true"></span>
      <span aria-hidden="true"></span>
    </button>
  </div>

  <div id="navbar-menu" class="navbar-menu" class:is-active={menuOpen}>
    <div class="navbar-end">
      <!--
        `data-testid` on these two because the tutorial's creation tracks point
        at them: the first thing it teaches is where the button is, and a tour
        that starts with the form already open never shows anybody that.
      -->
      <a class="navbar-item" href="#create-poll" data-testid="nav-create-poll"
        onclick={act(onCreatePoll)}>Create Poll</a>
      <a class="navbar-item" href="#create-event" data-testid="nav-create-event"
        onclick={act(onCreateEvent)}>Create Event</a>
      <a class="navbar-item" href="#tutorial" onclick={act(onTutorial)}>Tutorial</a>
      {#if loggedIn}
        <a class="navbar-item" href="#account" onclick={act(onAccount)}>Account</a>
        <a class="navbar-item" href="#logout" onclick={act(onLogout)}>Log Out</a>
      {:else}
        <a class="navbar-item" href="#login" onclick={act(onLogin)}>Log In</a>
      {/if}

      <!--
        One button cycling system → light → dark rather than a two-state switch.
        The accessible name carries the *setting*, because that is what pressing
        it changes; the icon shows what is currently rendered, which under
        "match system" the setting does not tell you.
      -->
      <div class="navbar-item">
        <button
          type="button"
          class="button is-small is-ghost theme-toggle"
          data-testid="theme-toggle"
          aria-label={`Theme: ${theme.label}. Change`}
          title={`Theme: ${theme.label}`}
          onclick={() => theme.cycle()}
        >
          <span aria-hidden="true">{theme.isDark ? '☾' : '☀'}</span>
          <span class="theme-toggle-label">{theme.label}</span>
        </button>
      </div>
    </div>
  </div>
</nav>
