<script>
  /**
   * Reproduces the legacy navbar exactly (docs/legacy/02-aesthetics.md §0.1).
   *
   * Deliberately has no navbar-burger and no navbar-menu — the legacy markup
   * had neither, so Bulma stacks the links under the brand on mobile. Do not
   * "helpfully" add a hamburger; that is a visible departure from main.
   */
  let {
    loggedIn = false, onCreateEvent, onLogin, onAccount, onLogout, onHome,
  } = $props();

  /**
   * Run a navbar action without letting the link navigate.
   *
   * Every item here is an `href="#thing"` anchor whose click handler opens a
   * modal, and none of them prevented the default — so each one pushed a
   * history entry like `?event=X#login`. Back then walked through a trail of
   * fragments that changed nothing visible, and on Chromium the resulting
   * `popstate` fired in the same tick as the click, which is a hazard the route
   * listener already has to work around.
   */
  const act = (fn) => (e) => {
    e.preventDefault();
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
  </div>
  <div class="navbar-end">
    <a class="navbar-item" href="#create-event" onclick={act(onCreateEvent)}>Create Event</a>
    {#if loggedIn}
      <a class="navbar-item" href="#account" onclick={act(onAccount)}>Account</a>
      <a class="navbar-item" href="#logout" onclick={act(onLogout)}>Log Out</a>
    {:else}
      <a class="navbar-item" href="#login" onclick={act(onLogin)}>Log In</a>
    {/if}
  </div>
</nav>
