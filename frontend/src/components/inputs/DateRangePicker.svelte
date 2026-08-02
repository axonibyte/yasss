<script>
  /**
   * bulma-calendar wrapper — the only imperative island left in the app.
   *
   * It is kept (rather than replaced with a native picker) so the window
   * modal's appearance does not change. It owns its own DOM and emits its own
   * events, so it gets attached in an effect with an explicit teardown; the
   * legacy never destroyed instances at all, and only got away with it by
   * discarding and rebuilding the whole input on every open.
   *
   * Two legacy defects avoided here. Its option object aliased one Date between
   * `startDate` and `startTime`, so setting hours on one mutated the other. And
   * `minDate` was pinned to tomorrow even when editing an existing window whose
   * start was already in the past, making it uneditable.
   */
  import { tomorrowAt } from '../../lib/format/dates.js';

  let {
    begin = $bindable(null),
    end = $bindable(null),
    /** Only a brand-new window is floored at tomorrow. */
    restrictToFuture = true,
  } = $props();

  let element = $state(null);

  $effect(() => {
    if (!element || !window.bulmaCalendar) return;

    // Distinct Date instances — never share a reference between these.
    const defaultBegin = begin ?? tomorrowAt(8);
    const defaultEnd = end ?? tomorrowAt(17);

    const options = {
      displayMode: 'dialog',
      isRange: true,
      type: 'datetime',
      timeFormat: 'hh:mm a',
      validateLabel: 'Save',
      startDate: new Date(defaultBegin),
      endDate: new Date(defaultEnd),
      startTime: new Date(defaultBegin),
      endTime: new Date(defaultEnd),
    };
    if (restrictToFuture) options.minDate = tomorrowAt(0);

    const [instance] = window.bulmaCalendar.attach(element, options);

    const onSelect = () => {
      begin = instance.startDate ?? null;
      end = instance.endDate ?? null;
    };
    instance.on('select', onSelect);
    instance.on('save', onSelect);

    return () => {
      instance.removeListeners?.();
      instance.destroy?.();
    };
  });
</script>

<div class="control">
  <input bind:this={element} class="input" type="date" aria-label="Window range" />
</div>
