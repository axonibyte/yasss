<script>
  /**
   * A row: a start time, optionally repeated, applied to some or all columns.
   *
   * There is no end time, by design -- a poll asks "can you make nine?", and the
   * duration is the event's business once the poll has settled the hour.
   *
   * The repeat is an authoring convenience and nothing else: it produces a
   * handful of start times here and is then forgotten. The bound on it is the
   * organiser's own -- a repeat may not ask for more time than is left between
   * the first window and the end of the day -- and it is checked as they type,
   * because finding out at submit time which of six numbers was wrong is worse.
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
  let mode = $state('all');
  let selected = $state([]);
  // svelte-ignore state_referenced_locally
  let future = $state(win?.appliesToNewOptions ?? false);
  let errors = $state({});

  /** Live, so the organiser sees what they are about to create. */
  const verdict = $derived(repeat ? checkInterval(start, hours, minutes) : { ok: true });
  const preview = $derived(
    verdict.ok ? expandRepeat({ start, repeat, hours: Number(hours), minutes: Number(minutes) }) : [],
  );

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
      <Field label="Repeat every" error={errors.repeat ?? (verdict.ok ? null : verdict.reason)}
        id="poll-repeat-every">
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
