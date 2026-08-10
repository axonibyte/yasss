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
              <tr class:is-selected={row.votes === best && best > 0}>
                <td>{row.when}</td>
                <td class="has-text-right">{row.votes}</td>
                <td style="width: 40%">
                  <!--
                    A bar rather than a chart: one number per row, and the only
                    comparison that matters is against the best row.
                  -->
                  <progress
                    class="progress is-primary is-small"
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
