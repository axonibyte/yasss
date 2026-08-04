/**
 * The fuzz corpora, shared with the browser suite.
 *
 * A re-export rather than a copy or a move. The canonical file lives under
 * `frontend/tests/live/helpers/` because that is where most of it is consumed
 * and where it is maintained alongside the specs; the drivers reach across the
 * repo mount for it so that the two tiers cannot drift into disagreeing about
 * what a hostile string is.
 *
 * If it ever needs to move, this is the only file that changes.
 */
export * from '../../frontend/tests/live/helpers/corpus.js';
