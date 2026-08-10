<script>
  /**
   * "Have a code?" — the other half of short codes.
   *
   * Without somewhere to type one, a code is just a shorter URL. This is the
   * surface that makes it worth reading down a telephone or printing on a
   * flyer.
   *
   * Validation is local and immediate: the code either normalizes to eight
   * symbols or it does not, and saying so at the field is far better than a
   * round trip that ends in "not found". Whether anything *holds* that code is
   * still the server's answer.
   *
   * One box for both kinds. Somebody typing eight characters off a flyer does
   * not know whether they are holding an event or a poll, and asking them would
   * be asking them to know something about our data model. The caller resolves
   * the code once and opens whichever it names -- which is why the codes share
   * a namespace at all.
   */
  import Field from './inputs/Field.svelte';
  import { fieldAria } from '../lib/a11y.js';
  import { normalizeCode } from '../lib/eventCode.js';

  let { onGo } = $props();

  let raw = $state('');
  let error = $state(null);

  function go(e) {
    e?.preventDefault();
    const code = normalizeCode(raw);
    if (!code) {
      error = 'A code is eight characters, like ABCD-EFGH.';
      return;
    }
    error = null;
    onGo?.(code);
  }
</script>

<section class="section pt-0">
  <div class="container" style="max-width: 26rem;">
    <!-- A real form, so Enter submits. -->
    <form onsubmit={go}>
      <Field label="Have a code?" {error} id="event-code-entry">
        <div class="field has-addons">
          <div class="control is-expanded">
            <input
              id="event-code-entry"
              {...fieldAria('event-code-entry', error)}
              class="input"
              class:is-danger={error}
              type="text"
              inputmode="latin"
              autocapitalize="characters"
              autocomplete="off"
              spellcheck="false"
              placeholder="ABCD-EFGH"
              bind:value={raw}
              oninput={() => { error = null; }}
            />
          </div>
          <div class="control">
            <button class="button is-primary" type="submit">Go</button>
          </div>
        </div>
      </Field>
    </form>
  </div>
</section>
