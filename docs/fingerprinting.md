# Browser fingerprinting on single-answer polls

**Read this before deploying polls.** It describes the only feature in Yasss
that derives a persistent identifier from signals a visitor did not knowingly
provide, and it tells you what your privacy policy has to say about it.

## When it happens

Only when a poll's organiser turns **"Allow more than one answer per person"**
*off*, and only at the moment somebody submits an answer to that poll.

The setting is **on by default**, so a deployment where nobody changes it
collects nothing at all. `answerActions.submitAnswer` will not even call
`lib/fingerprint.js` unless `poll.allowMultiAnswers` is false.

## What is collected

A SHA-256 of eleven signals, computed in the browser
(`frontend/src/lib/fingerprint.js`):

user agent; language and language list; `hardwareConcurrency`; `deviceMemory`;
`maxTouchPoints`; screen width, height and colour depth; device pixel ratio;
the resolved IANA time zone; the UTC offset; and **a canvas rendering**.

Ten of those eleven are values a server already sees in request headers or can
infer trivially. The canvas rendering is the one that makes this
*fingerprinting* in the regulatory sense, and it is included deliberately:
without it, two identical phone models on the same OS version produce the same
digest, which makes the whole mechanism a no-op for exactly the population it
most needs to tell apart.

Deliberately **not** collected, and the file says so at the point somebody
might add them: WebGL's unmasked renderer string, font enumeration,
AudioContext probing, plugin lists, and the IP address (the server already has
that one).

The respondent's IP address *is* recorded alongside, in the same circumstances.

## What is stored

Not the digest the browser sent. The server stores
`SHA-256(poll id || client digest)` in `poll_response.fingerprint`, a
`BINARY(32)`.

That salting is the property worth stating in a policy: **the same browser
answering two different polls stores two unrelated values**, so this column
cannot be joined to itself to follow a person across polls. It can only ever
answer "has this browser already answered *this* poll".

The IP address is stored as `VARBINARY(16)` via `INET6_ATON`, the same way an
event volunteer's is.

## How long it is kept

For the life of the poll. `poll_response` cascades from `poll`, so deleting a
poll deletes every fingerprint and address on it, and that is a property of the
schema rather than a promise in a document.

There is no separate expiry sweep. A poll that is never deleted keeps them.

## What it is worth

Very little, and the product says so out loud in two places rather than
implying otherwise:

- the organiser, when they turn the setting off, is told *"we'll do our best to
  prevent multiple answers — but this sort of thing is trivial to bypass"*;
- the respondent, on the answer form, is told what is recorded and that it is
  scrambled, kept only for this poll, and deleted with it.

A private window defeats it. So does a second browser, or a phone. It stops
somebody answering twice by accident, and it stops the laziest deliberate
attempt. If a poll's result genuinely matters, the honest answer is to require
sign-in.

## What your privacy policy must say

Yasss serves the policy you configure at `texts.privacyPolicy`; there is no
built-in text, so nothing here reaches your users unless you write it. If you
enable polls, that document needs to cover:

1. that a device characteristic and an IP address are recorded **when a poll
   restricts answering to one per person**, and not otherwise;
2. what the characteristic is derived from — it is fair to summarise as
   "browser and device settings, including a rendering test";
3. that it is stored one-way hashed and salted per poll, and so cannot be used
   to recognise the same person on a different poll;
4. that both are deleted when the poll is deleted;
5. the lawful basis you are relying on. In the EU and UK this is the kind of
   access-and-storage that ePrivacy treats like a cookie, and legitimate
   interest is not obviously sufficient — take advice rather than copying this
   paragraph.

If you would rather not make that disclosure, the feature is avoidable: leave
"allow multiple answers" on, and nothing is collected.
