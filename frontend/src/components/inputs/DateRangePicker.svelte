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
  import { untrack } from 'svelte';
  import { tomorrowAt } from '../../lib/format/dates.js';
  import { loadCalendar } from '../../lib/calendar.js';

  let {
    begin = $bindable(null),
    end = $bindable(null),
    /** Only a brand-new window is floored at tomorrow. */
    restrictToFuture = true,
  } = $props();

  let element = $state(null);

  $effect(() => {
    if (!element) return;

    // Read untracked. This effect *owns* begin and end once mounted — it
    // publishes into them — so tracking them here would make it retrigger
    // itself and re-attach the picker in a loop.
    const defaultBegin = untrack(() => begin) ?? tomorrowAt(8);
    const defaultEnd = untrack(() => end) ?? tomorrowAt(17);

    // Distinct Date instances — never share a reference between these.
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

    // Publish the defaults synchronously, before the picker has loaded.
    //
    // Two problems this solves at once. The picker renders its default range as
    // soon as it attaches, so without an eager publish the field would show a
    // perfectly good range while the bound values were still null, and saving
    // would ask the user to specify a range they can already see. And now that
    // the picker arrives asynchronously, a user quick enough to press Save
    // before a megabyte of JavaScript downloads would hit exactly that. The
    // defaults are known here and now, so there is no reason to wait for them.
    begin = options.startDate;
    end = options.endDate;

    let cancelled = false;
    let instance = null;
    /** The container bulma-calendar generates and owns; see the teardown. */
    let container = null;

    loadCalendar().then((bulmaCalendar) => {
      if (cancelled) return;
      [instance] = bulmaCalendar.attach(element, options);
      container = document.getElementById(instance.id);

      const publish = () => {
        begin = instance.startDate ?? null;
        end = instance.endDate ?? null;
      };
      publish();

      instance.on('select', publish);
      instance.on('save', publish);
    });

    // Returned synchronously, so Svelte always has a teardown even if the
    // effect re-runs before the loader resolves.
    return () => {
      cancelled = true;
      // Clears the emitter's own subscriptions ('select'/'save'), not any DOM
      // listener -- despite the name.
      instance?.removeListeners?.();

      // `destroy()` is, in full, `document.getElementById(this.id).remove()`
      // plus three null assignments -- with no guard on that lookup. Closing
      // the window editor unmounts this component, and by the time the teardown
      // runs Svelte has already detached the modal's subtree, so the lookup
      // finds nothing and destroy throws. That made an uncaught TypeError the
      // normal outcome of saving or dismissing a window.
      //
      // The lookup can still succeed when the effect re-runs with the modal
      // left open, so prefer the library's own teardown when it will work and
      // fall back to removing the container directly -- which is all destroy()
      // would have done, and works on a detached node.
      if (instance && document.getElementById(instance.id)) instance.destroy();
      else container?.remove();

      instance = null;
      container = null;
    };
  });
</script>

<div class="control">
  <input bind:this={element} class="input" type="date" aria-label="Window range" />
</div>
