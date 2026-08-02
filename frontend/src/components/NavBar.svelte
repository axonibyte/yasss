<script>
  /**
   * Reproduces the legacy navbar exactly (docs/legacy/02-aesthetics.md §0.1).
   *
   * Deliberately has no navbar-burger and no navbar-menu — the legacy markup
   * had neither, so Bulma stacks the links under the brand on mobile. Do not
   * "helpfully" add a hamburger; that is a visible departure from main.
   */
  let { loggedIn = false, onCreateEvent, onLogin, onAccount, onLogout } = $props();
</script>

<!-- legacy had role="navigation"; it is <nav>'s implicit role, so it is dropped -->
<nav class="navbar" aria-label="main navigation">
  <div class="navbar-brand">
    <a class="navbar-item" href="/">
      <img src="/assets/img/yasss_logo_small.png" alt="Yasss!" />
      <strong class="has-text-primary">Yasss!</strong>
    </a>
  </div>
  <div class="navbar-end">
    <a class="navbar-item" href="#create-event" onclick={onCreateEvent}>Create Event</a>
    {#if loggedIn}
      <a class="navbar-item" href="#account" onclick={onAccount}>Account</a>
      <a class="navbar-item" href="#logout" onclick={onLogout}>Log Out</a>
    {:else}
      <a class="navbar-item" href="#login" onclick={onLogin}>Log In</a>
    {/if}
  </div>
</nav>
