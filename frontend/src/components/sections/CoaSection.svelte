<script>
  /**
   * The logged-out call to action. docs/legacy/02-aesthetics.md §1.2.
   *
   * The legacy injected the rendered markdown into a `<p>`, which the browser
   * then had to reparent because the content itself contains block elements.
   * Rendering into a div matches the resulting appearance without the invalid
   * nesting.
   */
  import { getText } from '../../lib/api/index.js';
  import { renderMarkdownWithPrimaryLinks } from '../../lib/markdown.js';

  let { onCreateEvent, onTutorial } = $props();

  let html = $state('');

  $effect(() => {
    let cancelled = false;
    getText('coa')
      .then((src) => { if (!cancelled) html = renderMarkdownWithPrimaryLinks(src); })
      .catch(() => { /* the section still renders with its CTA */ });
    return () => { cancelled = true; };
  });
</script>

<section id="coa-section" class="section">
  <div class="card">
    <div class="card-content">
      <div class="content has-text-centered">
        <p class="subtitle">Welcome, friend!</p>
        <div class="mb-5">
          <!-- operator-authored config from content/coa.md, not user input -->
          {@html html}
        </div>
        <div class="buttons is-centered">
          <button class="button is-primary is-medium" onclick={onCreateEvent}>
            Create an Event!
          </button>
          <!--
            Beside the call to action rather than above it: someone who already
            knows what they want should not have to read past an offer of
            lessons, and someone who does not is looking at this card anyway.
          -->
          <button
            class="button is-medium"
            data-testid="tutorial-start"
            onclick={onTutorial}
          >
            Show me how it works
          </button>
        </div>
      </div>
    </div>
  </div>
</section>
