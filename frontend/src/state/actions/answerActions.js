/**
 * Submitting and revising an answer.
 *
 * The edit token is the whole of this file's care. An anonymous respondent gets
 * one exactly once, in the reply to their submission, and it is the only thing
 * they can present to prove an answer is theirs -- so it is stored per poll,
 * under a key that cannot collide, and it is never sent anywhere except back to
 * the poll that issued it.
 */
import * as api from '../../lib/api/index.js';
import { fingerprint } from '../../lib/fingerprint.js';
import { responseFromApi } from '../../lib/api/pollDto.js';
import { isRemote } from './remote.js';
import { toastError, toastSuccess } from '../toast.js';

const tokenKey = (pollId) => `yasss.poll.${pollId}.token`;

/** The token this browser holds for a poll, if it has answered before. */
export function storedToken(pollId) {
  try {
    return globalThis.localStorage?.getItem(tokenKey(pollId)) ?? null;
  } catch {
    // A browser with storage disabled simply cannot revise an anonymous answer.
    // That is a worse experience, not a broken one, and it must not throw here.
    return null;
  }
}

function rememberToken(pollId, token) {
  if (!token) return;
  try {
    globalThis.localStorage?.setItem(tokenKey(pollId), token);
  } catch {
    // As above.
  }
}

const detailsOf = (answer) =>
  [...(answer.values ?? new Map())].map(([detail, value]) => ({ detail, value }));

/** Take the server's answer as authoritative, rather than trusting the form. */
function adopt(poll, raw) {
  const response = responseFromApi(raw);
  poll.ownResponse = response;
  poll.votes.clear();
  for (const id of response.votes) poll.votes.add(id);
  return response;
}

/**
 * Submit an answer.
 *
 * @param {object} poll
 * @param {{name: string, votes: string[], values: Map<string, unknown>}} answer
 */
export async function submitAnswer(poll, answer, { captcha = null } = {}) {
  if (!isRemote(poll)) {
    // A tutorial poll: record it locally so the tour can show the result of
    // answering, and send nothing anywhere.
    poll.votes.clear();
    for (const id of answer.votes) poll.votes.add(id);
    return { ok: true, sandbox: true };
  }

  const payload = {
    name: answer.name,
    votes: [...answer.votes],
    details: detailsOf(answer),
  };

  // Only when the poll allows one answer each. A poll that permits several
  // collects nothing at all, and that is the default.
  if (!poll.allowMultiAnswers) {
    const digest = await fingerprint();
    if (digest) payload.fingerprint = digest;
  }

  try {
    const res = await api.addPollResponse(poll.id, payload, captcha);
    rememberToken(poll.id, res.response?.editToken ?? null);
    adopt(poll, res.response);
    toastSuccess('Thanks, your answer is in.');
    return { ok: true };
  } catch (e) {
    toastError(e, "Couldn't record your answer... sorry.");
    return { ok: false };
  }
}

/** Revise an answer already given. */
export async function reviseAnswer(poll, answer) {
  if (!isRemote(poll)) {
    poll.votes.clear();
    for (const id of answer.votes) poll.votes.add(id);
    return { ok: true, sandbox: true };
  }

  try {
    const res = await api.updatePollResponse(
      poll.id,
      poll.ownResponse.id,
      { name: answer.name, votes: [...answer.votes], details: detailsOf(answer) },
      storedToken(poll.id),
    );
    adopt(poll, res.response);
    toastSuccess('Updated your answer.');
    return { ok: true };
  } catch (e) {
    toastError(e, "Couldn't update your answer... sorry.");
    return { ok: false };
  }
}

/** Withdraw an answer. */
export async function withdrawAnswer(poll) {
  // The sandbox clause its two siblings above already carry. It was missing
  // here because Withdraw is only rendered when `ownResponse` is set and the
  // practice poll never sets one, so it could not be reached -- which is an
  // argument about the current UI, not about this function. Every other write
  // in this module is gated; leaving one ungated makes the rule look optional.
  if (!isRemote(poll)) {
    poll.votes.clear();
    return true;
  }
  try {
    await api.deletePollResponse(poll.id, poll.ownResponse.id, storedToken(poll.id));
    poll.ownResponse = null;
    poll.votes.clear();
    toastSuccess('Withdrew your answer.');
    return true;
  } catch (e) {
    toastError(e, "Couldn't withdraw your answer... sorry.");
    return false;
  }
}
