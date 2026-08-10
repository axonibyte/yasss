<script>
  /**
   * Who is answering, and their answers to the poll's own questions.
   *
   * One person, not a list. An event's organiser signs several volunteers up in
   * one sitting; a poll asks one person which times work for them, so there is
   * no "add another" here and no picker to choose between entries. That is the
   * whole difference between the two surfaces, and it is why this is not
   * `VolunteerModal` with a flag.
   *
   * Which squares they chose is not collected here -- that is the grid, which
   * stays on screen behind this. This modal is the name and the questions.
   */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { fieldAria } from '../../lib/a11y.js';
  import { DETAIL_TYPES } from '../../lib/validation/detailTypes.js';

  let {
    poll,
    existing = null,
    busy = false,
    onSave,
    onWithdraw = null,
    onClose,
  } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(existing?.name ?? '');
  // svelte-ignore state_referenced_locally
  let values = $state(new Map(existing?.values ?? []));
  let errors = $state({});

  const isRevision = $derived(existing !== null);

  const setValue = (id, value) => { values = new Map(values).set(id, value); };

  function validate() {
    const next = {};
    if (!name.trim()) next.name = 'Please give a name, so the organiser knows who answered.';

    for (const detail of poll.details) {
      const type = DETAIL_TYPES[detail.type];
      if (!type) continue;
      const raw = values.get(detail.id);
      if (detail.required && type.isBlank(raw)) {
        next[detail.id] = 'This one is required.';
        continue;
      }
      if (!type.isBlank(raw) && type.pattern && !type.pattern.test(type.serialize(raw))) {
        next[detail.id] = type.message;
      }
    }

    errors = next;
    return Object.keys(next).length === 0;
  }

  function submit() {
    if (!validate()) return;

    // Serialized through the type registry, so a boolean goes as "true" and an
    // email is lowercased -- the same normalisation the server validates
    // against. An optional unticked checkbox is still sent, because "no" is an
    // answer and dropping it makes it indistinguishable from never asked.
    const out = new Map();
    for (const detail of poll.details) {
      const type = DETAIL_TYPES[detail.type];
      if (!type) continue;
      const raw = values.get(detail.id);
      const omittable = type.isOmittable ?? type.isBlank;
      if (omittable(raw)) continue;
      out.set(detail.id, type.serialize(raw));
    }

    onSave?.({ name: name.trim(), values: out });
  }
</script>

<Modal title={isRevision ? 'Update your answer' : 'Your answer'} {onClose} onSubmit={submit}>
  <Field label="Your name" error={errors.name} id="poll-answer-name">
    <input
      id="poll-answer-name"
      {...fieldAria('poll-answer-name', errors.name)}
      class="input"
      class:is-danger={errors.name}
      type="text"
      bind:value={name}
      oninput={() => { errors = { ...errors, name: null }; }}
    />
  </Field>

  {#each poll.details as detail (detail.id)}
    {@const type = DETAIL_TYPES[detail.type]}
    {#if type}
      <Field
        label={detail.label + (detail.required ? ' *' : '')}
        error={errors[detail.id]}
        id={`poll-detail-${detail.id}`}
      >
        {#if type.input === 'switch'}
          <input
            id={`poll-detail-${detail.id}`}
            type="checkbox"
            class="switch is-rtl"
            checked={values.get(detail.id) === true}
            onchange={(e) => setValue(detail.id, e.currentTarget.checked)}
          />
          <label class="switch" for={`poll-detail-${detail.id}`}>{detail.hint || detail.label}</label>
        {:else}
          <input
            id={`poll-detail-${detail.id}`}
            {...fieldAria(`poll-detail-${detail.id}`, errors[detail.id])}
            class="input"
            class:is-danger={errors[detail.id]}
            type={type.input === 'number' ? 'number' : 'text'}
            placeholder={detail.hint}
            value={values.get(detail.id) ?? ''}
            oninput={(e) => {
              setValue(detail.id, e.currentTarget.value);
              errors = { ...errors, [detail.id]: null };
            }}
          />
        {/if}
      </Field>
    {/if}
  {/each}

  {#if !poll.allowMultiAnswers}
    <!--
      The respondent is told what is collected, in the same breath as the
      organiser is told it is easy to bypass. Somebody being fingerprinted has
      more right to know about it than the person who switched it on.
    -->
    <p class="help" data-testid="fingerprint-notice">
      This poll allows one answer each, so we record your IP address and a
      characteristic of your browser to spot repeats. Both are stored scrambled,
      only for this poll, and go when the poll does.
    </p>
  {/if}

  {#snippet footer()}
    <LoadingButton loading={busy} onclick={submit}>
      {isRevision ? 'Update' : 'Submit'}
    </LoadingButton>
    {#if isRevision && onWithdraw}
      <button class="button is-danger is-light" onclick={onWithdraw}>Withdraw</button>
    {/if}
    <button class="button" onclick={onClose}>Cancel</button>
  {/snippet}
</Modal>
