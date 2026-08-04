import { mount } from 'svelte';
import './app.scss';
import App from './App.svelte';
import { toastDanger } from './state/toast.js';

/**
 * Catch what nothing else caught.
 *
 * Every deliberate failure path in this app toasts. What had nowhere to go was
 * the accidental kind — a rejected promise nobody awaited, a render that threw —
 * and those went to the console, which nobody has open. The symptom is a button
 * that does nothing: no spinner, no message, no clue.
 *
 * Deliberately vague, and deliberately not showing the error text. These are by
 * definition failures nobody anticipated, so there is no useful advice to give,
 * and the raw message is a stack-shaped string written for whoever is reading
 * the console — "Cannot read properties of undefined" helps nobody staring at a
 * form. The detail still goes to the console, where it belongs.
 *
 * Registered before `mount` so a failure during the first render is caught too.
 */
function reportUncaught(kind, detail) {
  // eslint-disable-next-line no-console
  console.error(`[uncaught ${kind}]`, detail);
  toastDanger('Something went wrong. Reload the page if things look wrong.');
}

window.addEventListener('error', (e) => {
  // Resource load failures (a missing image, a blocked script) also fire this,
  // and they are not something to interrupt anybody about. Only real exceptions
  // carry `error`.
  if (!e.error) return;
  reportUncaught('error', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  reportUncaught('rejection', e.reason);
});

export default mount(App, { target: document.getElementById('app') });
