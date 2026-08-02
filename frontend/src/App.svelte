<script>
  /**
   * Phase 0 skeleton: chrome only.
   *
   * Sections, modals, routing, session and the event grid arrive in phases 2-5
   * per the plan. What is here is the frame the rest hangs off, and it is
   * deliberately faithful to docs/legacy/02-aesthetics.md.
   */
  import NavBar from './components/NavBar.svelte';
  import Footer from './components/Footer.svelte';
  import PageLoader from './components/PageLoader.svelte';
  import IntroSection from './components/IntroSection.svelte';

  // The legacy splash was a fixed 1 s, not tied to data readiness (app.js:3195).
  let loading = $state(true);
  setTimeout(() => { loading = false; }, 1000);

  const loggedIn = $state(false);
</script>

<PageLoader active={loading} />

<NavBar {loggedIn} />

<IntroSection />

<Footer />
