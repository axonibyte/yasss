<script>
  /**
   * Ask before doing something that cannot be taken back.
   *
   * There was no confirmation anywhere in the app, and no undo either. Removing
   * an activity, a window, a custom field or a volunteer was immediate,
   * server-side and irreversible — and in edit mode the Remove button sits
   * directly beside Save, so the cost of a misclick was somebody else's
   * afternoon of scheduling.
   *
   * Deliberately not `window.confirm`. That would work and be accessible, but it
   * cannot say *what* is about to be lost, and the consequence is the part worth
   * reading: removing an activity takes its slots and every RSVP in them.
   *
   * The cancel button is focused first — `Modal`'s trap takes the first
   * focusable control, and the order here puts Cancel ahead of the destructive
   * one on purpose. Enter on an unread dialog should not destroy anything.
   */
  import Modal from './Modal.svelte';
  import LoadingButton from '../inputs/LoadingButton.svelte';

  let {
    /** The question, as a question. */
    title = 'Are you sure?',
    /** What will actually happen, in plain words. */
    detail = 'This cannot be undone.',
    /** The destructive button's label, naming the thing rather than "OK". */
    confirmLabel = 'Remove',
    onConfirm,
    onCancel,
  } = $props();

  let busy = $state(false);

  async function confirm() {
    busy = true;
    try {
      await onConfirm?.();
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={title} onClose={onCancel}>
  <p data-testid="confirm-detail">{detail}</p>

  {#snippet footer()}
    <div class="buttons">
      <button class="button" type="button" disabled={busy} onclick={onCancel}>
        Cancel
      </button>
      <LoadingButton variant="is-danger" loading={busy} onclick={confirm}>
        {confirmLabel}
      </LoadingButton>
    </div>
  {/snippet}
</Modal>
