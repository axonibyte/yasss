/**
 * Print each tutorial track as continuous prose, in order.
 *
 * The cheapest useful thing in the whole tutorial-audit story, and the one with
 * no machinery behind it: a person reading a track cold finds more in five
 * minutes than any checker written for the purpose. The checks catch what is
 * structural -- a step opening an editor without saying so, copy naming a button
 * that was renamed. They cannot tell you a sentence does not land.
 *
 * No browser, no model, no dependencies: the copy and the step order are both
 * static, so this is two file reads. That also makes it the half of the audit
 * that runs on any machine, including the ones where Playwright does not.
 *
 *   node tools/read-tutorial.mjs            all four tracks
 *   node tools/read-tutorial.mjs voter      one of them
 *
 * Read it as somebody who has never seen the product. The question is not "is
 * this true" -- it is -- but "would I know what this is talking about if this
 * were the first screen I ever saw".
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DEFAULT_COPY } from '../src/lib/tutorial/defaults.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../src/state/tutorial.svelte.js'), 'utf8');

const start = src.indexOf('const STEPS = [');
const end = src.indexOf('\n];', start);
const steps = [...src.slice(start, end).matchAll(/\n {2}\{\n([\s\S]*?)\n {2}\},/g)].map((m) => ({
  id: /id: '([^']+)',/.exec(m[1])?.[1],
  track: /track: '([^']+)',/.exec(m[1])?.[1],
  mode: /mode: '(\w+)',/.exec(m[1])?.[1] ?? 'VIEW',
  stage: /stage: '(\w+)',/.exec(m[1])?.[1] ?? 'subject',
  anchor: /anchor: '([^']+)'/.exec(m[1])?.[1] ?? null,
  // The dialog the step opens, which is most of what a creation track is doing
  // and the thing a reader of the prose alone cannot see.
  modal: /modal: \{[\s\S]*?kind: '([^']+)'/.exec(m[1])?.[1] ?? null,
}));

const wanted = process.argv[2];
const tracks = [...new Set(steps.map((s) => s.track))].filter((t) => !wanted || t === wanted);

if (wanted && tracks.length === 0) {
  console.error(`no such track: ${wanted}`);
  console.error(`try one of: ${[...new Set(steps.map((s) => s.track))].join(', ')}`);
  process.exit(1);
}

for (const track of tracks) {
  const mine = steps.filter((s) => s.track === track);
  console.log(`\n${'='.repeat(74)}\n  ${track.toUpperCase()}  —  ${mine.length} steps\n${'='.repeat(74)}`);

  let mode = null;
  let stage = null;
  let modal = null;
  mine.forEach((step, i) => {
    // Surfaced because they are the things a reader cannot see from the words:
    // the page changes shape here, and the copy has to account for it.
    if (stage !== null && step.stage !== stage) {
      console.log(step.stage === 'home'
        ? '\n    ~~~ back to the landing page here ~~~'
        : `\n    ~~~ the landing page gives way to the practice ${
          ['poll', 'voter'].includes(track) ? 'poll' : 'event'} here ~~~`);
    }
    stage = step.stage;

    if (mode !== null && step.mode !== mode) {
      console.log(`\n    ~~~ the page switches to ${step.mode} here ~~~`);
    }
    mode = step.mode;

    if (step.modal !== modal) {
      console.log(step.modal
        ? `\n    ~~~ the "${step.modal}" dialog opens here ~~~`
        : '\n    ~~~ the dialog closes here ~~~');
    }
    modal = step.modal;

    console.log(`\n--- ${i + 1}/${mine.length}  ${step.id}${step.anchor ? `  → ${step.anchor}` : '  (whole page)'}`);
    console.log();
    console.log((DEFAULT_COPY[step.id] ?? '*** NO COPY ***').split('\n').map((l) => `  ${l}`).join('\n'));
  });
  console.log();
}
