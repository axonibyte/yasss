<script>
  /**
   * Everything about a poll except its grid.
   *
   * Two of these fields are decisions the organiser cannot walk back, so the
   * form says so at the point of choosing rather than letting the server refuse
   * later:
   *
   * - Scope is fixed once the poll exists. A weekday poll's columns hold no
   *   dates and an absolute poll's hold no weekdays, so changing it would
   *   invalidate the whole grid and every vote on it. The server refuses the
   *   PATCH; here the control is simply disabled with the reason next to it.
   * - Two of the six result settings are meaningless without a deadline, and
   *   one of them narrows who may answer at all. Both are surfaced inline.
   */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import DayPicker from '../inputs/DayPicker.svelte';
  import DatePicker from '../inputs/DatePicker.svelte';
  import { fieldAria } from '../../lib/a11y.js';
  import { NEEDS_ACCOUNT, NEEDS_DEADLINE, VISIBILITY } from '../../state/poll.svelte.js';
  import { localZone } from '../../lib/poll/zones.js';

  let {
    poll = null,
    isNew = true,
    loggedIn = false,
    busy = false,
    onSave,
    onClose,
  } = $props();

  // Seeded from the poll once, deliberately. This modal is mounted fresh
  // every time it is opened, so the initial value is the current one -- and
  // a form that re-read the poll while it was being edited would discard
  // what the organiser had typed if anything else touched it.
  // svelte-ignore state_referenced_locally
  let title = $state(poll?.title ?? '');
  // svelte-ignore state_referenced_locally
  let description = $state(poll?.description ?? '');
  // svelte-ignore state_referenced_locally
  let scope = $state(poll?.scope ?? 'RELATIVE');
  // svelte-ignore state_referenced_locally
  let timeMode = $state(poll?.timeMode ?? 'WALL_CLOCK');
  // svelte-ignore state_referenced_locally
  let timezone = $state(poll?.timezone ?? localZone());
  // svelte-ignore state_referenced_locally
  let allowMultiAnswers = $state(poll?.allowMultiAnswers ?? true);
  // svelte-ignore state_referenced_locally
  let allowAnswerEdits = $state(poll?.allowAnswerEdits ?? true);
  // svelte-ignore state_referenced_locally
  let resultVisibility = $state(
    poll?.resultVisibility ?? (loggedIn ? 'CREATOR_ONLY' : 'RESPONDENT_ALL_AFTER_SUBMIT'),
  );

  /** Days and dates are only collected here while building; later they are grid columns. */
  // svelte-ignore state_referenced_locally
  let days = $state(poll?.options?.map((o) => o.dayOfWeek).filter(Boolean) ?? []);
  // svelte-ignore state_referenced_locally
  let dates = $state(poll?.options?.map((o) => o.date).filter(Boolean) ?? []);

  // svelte-ignore state_referenced_locally
  let deadlineLocal = $state(toLocalInput(poll?.deadline ?? null));
  let errors = $state({});

  /** Epoch millis to what `<input type="datetime-local">` wants, in local time. */
  function toLocalInput(millis) {
    if (!millis) return '';
    const d = new Date(millis);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const deadline = $derived(deadlineLocal ? new Date(deadlineLocal).getTime() : null);

  const ZONES = (() => {
    const known = typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : [];
    return [...new Set(['UTC', localZone(), ...known])].filter(Boolean).sort();
  })();

  const VISIBILITY_LABELS = {
    CREATOR_ONLY: 'Only me',
    PUBLIC_ALWAYS: 'Anyone with the link, at any time',
    PUBLIC_AFTER_CLOSE: 'Anyone with the link, once the poll closes',
    RESPONDENT_OWN: 'Each person sees only their own answer',
    RESPONDENT_ALL_AFTER_SUBMIT: 'People who have answered, straight away',
    RESPONDENT_ALL_AFTER_CLOSE: 'People who have answered, once the poll closes',
  };

  const needsDeadline = $derived(NEEDS_DEADLINE.has(resultVisibility));
  const needsAccount = $derived(resultVisibility === NEEDS_ACCOUNT);

  function validate() {
    const next = {};
    if (!title.trim()) next.title = 'Your poll needs a title.';
    if (isNew && scope === 'RELATIVE' && days.length === 0) {
      next.days = 'Pick at least one day.';
    }
    if (isNew && scope === 'ABSOLUTE' && dates.length === 0) {
      next.dates = 'Pick at least one date.';
    }
    if (needsDeadline && !deadline) {
      next.deadline = 'This results setting only makes sense with a deadline.';
    }
    if (deadline && deadline < Date.now()) {
      next.deadline = 'That deadline has already passed.';
    }
    // The one combination that would hide the results from everybody, the
    // organiser included -- an anonymous poll has no organiser to show them to.
    if (resultVisibility === 'CREATOR_ONLY' && !loggedIn) {
      next.resultVisibility = 'Sign in first, or nobody will ever see the results.';
    }
    errors = next;
    return Object.keys(next).length === 0;
  }

  function submit() {
    if (!validate()) return;
    onSave?.({
      title: title.trim(),
      description: description.trim(),
      scope,
      timeMode,
      // Sent as null on a wall-clock poll rather than left stale: the server
      // refuses a zone it would never read.
      timezone: timeMode === 'ZONED' ? timezone : null,
      deadline,
      allowMultiAnswers,
      allowAnswerEdits,
      resultVisibility,
      days: [...days],
      dates: [...dates],
    });
  }
</script>

<Modal title={isNew ? 'Create a poll' : 'Poll settings'} {onClose} onSubmit={submit}>
  <Field label="Poll title" error={errors.title} id="poll-title">
    <input
      id="poll-title"
      {...fieldAria('poll-title', errors.title)}
      class="input"
      class:is-danger={errors.title}
      type="text"
      placeholder="When shall we meet?"
      bind:value={title}
      oninput={() => { errors = { ...errors, title: null }; }}
    />
  </Field>

  <Field label="Describe your poll" id="poll-description">
    <textarea
      id="poll-description"
      class="textarea"
      rows="2"
      placeholder="Pick every time that works for you."
      bind:value={description}
    ></textarea>
  </Field>

  <Field label="What are you asking about?" id="poll-scope">
    <div class="control" data-testid="poll-scope">
      <label class="radio">
        <input type="radio" name="poll-scope" checked={scope === 'RELATIVE'} disabled={!isNew}
          onchange={() => { scope = 'RELATIVE'; }} />
        Days of the week
      </label>
      <label class="radio">
        <input type="radio" name="poll-scope" checked={scope === 'ABSOLUTE'} disabled={!isNew}
          onchange={() => { scope = 'ABSOLUTE'; }} />
        Specific dates
      </label>
    </div>
    {#if !isNew}
      <p class="help">
        This cannot be changed once the poll exists — the columns would no longer
        mean anything, and neither would the votes on them.
      </p>
    {/if}
  </Field>

  {#if isNew}
    {#if scope === 'RELATIVE'}
      <DayPicker bind:selected={days} error={errors.days} />
    {:else}
      <DatePicker bind:selected={dates} error={errors.dates} />
    {/if}
  {/if}

  <Field label="Whose clock?" id="poll-time-mode">
    <div class="control" data-testid="poll-time-mode">
      <label class="radio">
        <input type="radio" name="poll-time-mode" checked={timeMode === 'WALL_CLOCK'}
          onchange={() => { timeMode = 'WALL_CLOCK'; }} />
        Wall clock — 9am means 9am wherever you are
      </label>
      <label class="radio">
        <input type="radio" name="poll-time-mode" checked={timeMode === 'ZONED'}
          onchange={() => { timeMode = 'ZONED'; }} />
        A fixed time zone
      </label>
    </div>
  </Field>

  {#if timeMode === 'ZONED'}
    <Field label="Time zone" id="poll-timezone">
      <div class="select is-fullwidth">
        <select id="poll-timezone" bind:value={timezone}>
          {#each ZONES as zone (zone)}<option value={zone}>{zone}</option>{/each}
        </select>
      </div>
      <p class="help">People elsewhere will see these times converted into theirs.</p>
    </Field>
  {/if}

  <Field label="Deadline for answering (optional)" error={errors.deadline} id="poll-deadline">
    <input
      id="poll-deadline"
      {...fieldAria('poll-deadline', errors.deadline)}
      class="input"
      class:is-danger={errors.deadline}
      type="datetime-local"
      bind:value={deadlineLocal}
      oninput={() => { errors = { ...errors, deadline: null }; }}
    />
    {#if needsDeadline}
      <p class="help">The results setting you chose needs one.</p>
    {/if}
  </Field>

  <Field label="Who can see the results?" error={errors.resultVisibility} id="poll-visibility">
    <div class="select is-fullwidth">
      <select id="poll-visibility" bind:value={resultVisibility} data-testid="poll-visibility">
        {#each VISIBILITY as value (value)}
          <option {value}>{VISIBILITY_LABELS[value]}</option>
        {/each}
      </select>
    </div>
    {#if needsAccount}
      <p class="help is-warning">
        People will have to sign in to answer — it is the only way to still
        recognise them once the poll has closed.
      </p>
    {/if}
  </Field>

  <div class="field">
    <input id="poll-multi" type="checkbox" class="switch is-rtl" bind:checked={allowMultiAnswers} />
    <label class="switch" for="poll-multi">Allow more than one answer per person</label>
  </div>

  {#if !allowMultiAnswers}
    <!--
      Said plainly rather than softened. What is actually being offered is a
      speed bump: a browser fingerprint and an IP address stop somebody
      answering twice by accident, and anybody who wants to answer twice on
      purpose has a second browser.
    -->
    <article class="message is-warning" data-testid="multi-answer-warning">
      <div class="message-body">
        We'll do our best to prevent multiple answers — but this sort of thing is
        trivial to bypass. Anyone determined can use another browser or another
        device. If it really matters, ask people to sign in.
      </div>
    </article>
  {/if}

  <div class="field">
    <input id="poll-edits" type="checkbox" class="switch is-rtl" bind:checked={allowAnswerEdits} />
    <label class="switch" for="poll-edits">Let people change their answer afterwards</label>
  </div>

  {#snippet footer()}
    <div class="buttons">
      <LoadingButton loading={busy} onclick={submit}>
        {isNew ? 'Start building' : 'Save'}
      </LoadingButton>
      <button class="button" onclick={onClose}>Cancel</button>
    </div>
  {/snippet}
</Modal>
