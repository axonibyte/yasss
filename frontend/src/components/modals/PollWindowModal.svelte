<script>
  /**
   * A row: a start time, optionally repeated, applied to some or all columns.
   *
   * There is no end time, by design -- a poll asks "can you make nine?", and the
   * duration is the event's business once the poll has settled the hour.
   *
   * The repeat is an authoring convenience and nothing else: it produces a
   * handful of start times here and is then forgotten. It stops either at an
   * "until" the organiser named or at the end of the day, and either way the
   * bound is checked as they type -- finding out at submit time which of six
   * numbers was wrong is worse.
   *
   * The "until" is inclusive: a time landing on the cadence is offered. That is
   * argued out at length in lib/poll/windows.js, and the help text below says
   * so plainly, because a boundary nobody can see the rule for is a boundary
   * everybody gets wrong once.
   */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import TimeField from '../inputs/TimeField.svelte';
  import ApplyToField from '../inputs/ApplyToField.svelte';
  import { checkInterval, expandRepeat } from '../../lib/poll/windows.js';
  import { fmtClock } from '../../lib/poll/zones.js';

  let {
    win = null,
    options = [],
    scope = 'RELATIVE',
    busy = false,
    onSave,
    onDelete = null,
    onClose,
  } = $props();

  const isNew = $derived(win === null);

  // svelte-ignore state_referenced_locally
  let start = $state(win?.startTime ?? '09:00');
  let repeat = $state(false);
  let hours = $state(1);
  let minutes = $state(0);
  /** Blank means "carry on to the end of the day", which is what it did before. */
  let until = $state('');
  let mode = $state('all');
  let selected = $state([]);
  // svelte-ignore state_referenced_locally
  let future = $state(win?.appliesToNewOptions ?? false);
  let errors = $state({});

  /** Live, so the organiser sees what they are about to create. */
  const verdict = $derived(repeat ? checkInterval(start, hours, minutes, until) : { ok: true });
  const preview = $derived(
    verdict.ok
      ? expandRepeat({ start, repeat, hours: Number(hours), minutes: Number(minutes), until })
      : [],
  );

  /**
   * The verdict, but only where it belongs.
   *
   * An "until" before the start is not a complaint about the interval, and
   * showing it under "Repeat every" would send the organiser to correct the one
   * number that is right.
   */
  const faultOf = (field) => (!verdict.ok && verdict.field === field ? verdict.reason : null);

  function submit() {
    const next = {};
    if (!start) next.start = 'Pick a time.';
    if (repeat && !verdict.ok) next.repeat = verdict.reason;
    errors = next;
    if (Object.keys(next).length) return;

    onSave?.({
      start,
      repeat,
      hours: Number(hours),
      minutes: Number(minutes),
      until,
      mode,
      selected: [...selected],
      future,
    });
  }
</script>

<Modal title={isNew ? 'Add a time' : 'Edit this time'} {onClose} onSubmit={submit}>
  <TimeField label="Starts at" id="poll-window-start" bind:value={start} error={errors.start} />

  {#if isNew}
    <div class="field">
      <input id="poll-repeat" type="checkbox" class="switch is-rtl" bind:checked={repeat} />
      <label class="switch" for="poll-repeat">Repeat through the day</label>
    </div>

    {#if repeat}
      <Field label="Repeat every" error={faultOf('interval')} id="poll-repeat-every">
        <div class="field has-addons" id="poll-repeat-every">
          <div class="control">
            <input class="input" type="number" min="0" max="23" style="width: 5rem"
              aria-label="Hours" bind:value={hours} />
          </div>
          <div class="control"><span class="button is-static">h</span></div>
          <div class="control">
            <input class="input" type="number" min="0" max="59" step="5" style="width: 5rem"
              aria-label="Minutes" bind:value={minutes} />
          </div>
          <div class="control"><span class="button is-static">m</span></div>
        </div>
      </Field>

      <!--
        `min` is the browser's guard against an until before the start; the
        verdict above is ours. Both, because the native one stops the mistake
        being made and ours stops it being submitted -- `min` is honoured
        unevenly across pickers and not at all by a typed-in value.
      -->
      <TimeField
        label="Until"
        id="poll-repeat-until"
        bind:value={until}
        min={start}
        error={faultOf('until')}
      />
      <p class="help mb-3" data-testid="repeat-until-help">
        Leave this empty to carry on to the end of the day. A time that lands
        exactly on the repeat is offered — “until 5:00 PM” includes 5:00 PM.
      </p>

      {#if preview.length > 1}
        <p class="help mb-3" data-testid="repeat-preview">
          That makes {preview.length} times: {preview.slice(0, 4).map(fmtClock).join(', ')}{preview.length > 4 ? ', …' : ''}
          — the last is {fmtClock(preview[preview.length - 1])}.
        </p>
      {/if}
    {/if}

    <ApplyToField bind:mode bind:selected bind:future {options} {scope} />
  {:else}
    <div class="field">
      <input id="poll-window-future" type="checkbox" class="switch is-rtl" bind:checked={future} />
      <label class="switch" for="poll-window-future">
        Also apply this time to any day I add later
      </label>
    </div>
  {/if}

  {#snippet footer()}
    <LoadingButton loading={busy} onclick={submit}>{isNew ? 'Add' : 'Save'}</LoadingButton>
    {#if !isNew && onDelete}
      <button class="button is-danger is-light" onclick={onDelete}>Delete</button>
    {/if}
    <button class="button" onclick={onClose}>Cancel</button>
  {/snippet}
</Modal>
