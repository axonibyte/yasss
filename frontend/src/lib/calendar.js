/**
 * bulma-calendar, loaded on demand.
 *
 * It is a megabyte of JavaScript — more than the entire rest of the
 * application — because its own source does a template-literal `require` on
 * `date-fns/locale/${lang}`, which makes webpack bundle every locale. That is
 * fixed inside the package and not something we can trim from here.
 *
 * What *is* under our control is when it loads. It backs exactly one modal, the
 * window editor, which only an organiser building or editing an event ever
 * opens; a volunteer signing up for a bake sale used to download all of it to
 * never see it.
 *
 * Vite code-splits a dynamic import and emits a separate stylesheet per async
 * chunk, injecting the `<link>` at runtime — so importing the CSS here gets it
 * lazily too, with no manual script or stylesheet injection.
 */

let pending = null;

/**
 * @returns {Promise<any>} the `bulmaCalendar` object, with `attach`
 */
export function loadCalendar() {
  pending ??= Promise.all([
    import('bulma-calendar/dist/js/bulma-calendar.min.js'),
    import('./calendar.css'),
  ]).then(([module]) => (
    // A UMD build, so the interop shape depends on how Rollup resolved it.
    module.default ?? module.bulmaCalendar ?? window.bulmaCalendar
  ));
  return pending;
}
