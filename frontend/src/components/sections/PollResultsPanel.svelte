<script>
  /**
   * How the votes are going, for whoever is allowed to see.
   *
   * Whether this renders at all is the server's decision -- the tally is absent
   * from the payload when it is not disclosed, rather than present and hidden
   * -- so there is no visibility rule in here to get wrong. If `poll.tally` is
   * set, the caller is entitled to it.
   *
   * The denominator is everyone who answered, not the best square's count.
   * Somebody may answer and choose nothing, which is a real reply -- "none of
   * these work for me" -- and leaving them out would overstate how well the
   * winning time did.
   */
  import { windowLabel } from '../../lib/poll/zones.js';

  let { poll } = $props();

  const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function optionLabel(option) {
    if (poll.scope === 'RELATIVE') return WEEKDAYS[option.dayOfWeek] ?? '';
    if (!option.date) return '';
    const [year, month, day] = option.date.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      .format(new Date(year, month - 1, day));
  }

  /** Every offered square, best first, so the answer is the top row. */
  const ranked = $derived.by(() => {
    const rows = [];
    for (const option of poll.options) {
      if (option.allDay) {
        const cell = poll.cell(option, null);
        if (cell) rows.push({ key: cell.key, when: `${optionLabel(option)} — all day`, votes: poll.votesFor(cell) ?? 0 });
        continue;
      }
      for (const win of poll.windows) {
        const cell = poll.cell(option, win);
        if (!cell) continue;
        rows.push({
          key: cell.key,
          when: `${optionLabel(option)} — ${windowLabel(win.startTime, poll, option).primary}`,
          votes: poll.votesFor(cell) ?? 0,
        });
      }
    }
    return rows.sort((a, b) => b.votes - a.votes || a.when.localeCompare(b.when));
  });

  const best = $derived(ranked[0]?.votes ?? 0);
</script>

<div class="card" data-testid="poll-results">
  <div class="card-content">
    <div class="content">
      <h2 class="is-size-4">Results</h2>
      <p class="is-size-7">
        {poll.respondents} {poll.respondents === 1 ? 'person has' : 'people have'} answered.
      </p>

      {#if ranked.length === 0}
        <p>Nothing to count yet.</p>
      {:else}
        <table class="table is-fullwidth is-narrow">
          <thead>
            <tr><th>When</th><th class="has-text-right">Votes</th><th></th></tr>
          </thead>
          <tbody>
            {#each ranked as row (row.key)}
              <tr class:is-winner={row.votes === best && best > 0}>
                <td>
                  {row.when}
                  <!--
                    Ties are possible, so "the top row" does not identify the
                    winner and nor does any purely visual treatment. Said in
                    text, for anybody not reading the weight or the rule.
                  -->
                  {#if row.votes === best && best > 0}<span class="is-sr-only"> — most votes</span>{/if}
                </td>
                <td class="has-text-right">{row.votes}</td>
                <td style="width: 40%">
                  <!--
                    A bar rather than a chart: one number per row, and the only
                    comparison that matters is against the best row.

                    Every bar is the same colour, including the winner's. The
                    panel exists to compare rows, and a row whose bar is drawn
                    differently cannot be compared with the others by eye --
                    which is the one thing this table is for.
                  -->
                  <progress
                    class="progress is-small result-bar"
                    value={row.votes}
                    max={Math.max(poll.respondents, best, 1)}
                    aria-label={`${row.votes} of ${poll.respondents}`}
                  ></progress>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>
</div>

<style>
  /*
   * The winning row used Bulma's `.is-selected`, which fills it with
   * `--bulma-primary` -- the same colour as the `.is-primary` bar inside it.
   * Contrast ratio 1.00: the filled part of the winner's bar was invisible and
   * only the pale track showed, so the row with the most votes rendered the
   * emptiest-looking bar. The single most important row on the page read
   * backwards.
   *
   * Recolouring the bar inside the filled row was the obvious fix and is the
   * wrong one. On a bright turquoise row neither a darker nor a lighter track
   * separates well from the row itself (measured: nothing reached 3:1 at any
   * sensible alpha), and it would leave the winner's bar drawn differently from
   * every other bar -- in a table whose only purpose is comparing them.
   *
   * So the winner is marked without touching the row's background: weight, a
   * rule down the leading edge, and the text marker in the markup. Every bar
   * keeps one colour and one track.
   *
   * `--bulma-primary` is too light to be a data colour: against the track it
   * measures 1.65:1, under the 3:1 WCAG 1.4.11 asks of a graphical object that
   * carries meaning. `--bulma-primary-on-scheme` is the palette's answer for
   * "primary, but legible against the page" and is what the wordmark and links
   * already use. Measured with it: 5.46 light / 6.51 dark against the track,
   * 6.44 / 9.31 against the page. Both themes, because both variables are
   * theme-derived and follow.
   */
  .result-bar {
    --bulma-progress-value-background-color: var(--bulma-primary-on-scheme);
  }

  .is-winner td {
    font-weight: 600;
  }

  /*
   * `box-shadow` rather than `border-left`: a border changes the cell's box and
   * shifts the text of that one row out of line with the others.
   */
  .is-winner td:first-child {
    box-shadow: inset 0.1875rem 0 0 var(--bulma-primary-on-scheme);
  }
</style>
