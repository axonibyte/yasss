/**
 * Adversarial input corpora for the frontend fuzz specs.
 *
 * The point is not to be random. Randomness finds shallow bugs slowly and
 * reports them irreproducibly; a fixed, named corpus finds the same class of
 * bug every run and names the case in the failure. Each entry below exists
 * because it is a real shape of user input that the two tiers might disagree
 * about — whitespace the client trims and the server does not, characters that
 * survive a round trip only if nothing parses them as markup, lengths that fit
 * one column and not another, numbers that are integers to a human and not to
 * `Number.isInteger`.
 *
 * `expect` is what the *client* should do with the value, and is asserted
 * against the modal's behaviour. It is deliberately not "what the server does":
 * the whole reason these validators exist is to fail fast, so a value the client
 * accepts and the server refuses is a finding, not an expectation.
 */

/** Free-text values for a required field (event title, activity label, ...). */
export const REQUIRED_TEXT = [
  { name: 'empty', value: '', expect: 'rejected' },
  { name: 'spaces only', value: '     ', expect: 'rejected' },
  { name: 'tab and newline only', value: '\t\n', expect: 'rejected' },
  // trim() is Unicode-aware, so these are blank to the client too.
  { name: 'nbsp only', value: '\u00a0\u00a0', expect: 'rejected' },
  { name: 'ideographic space only', value: '\u3000', expect: 'rejected' },

  { name: 'single char', value: 'x', expect: 'accepted' },
  { name: 'padded', value: '   padded   ', expect: 'accepted' },
  { name: 'inner whitespace', value: 'a \t b', expect: 'accepted' },
  // Not whitespace per trim(), so this is a *non-blank* label that looks blank.
  { name: 'zero width only', value: '\u200b\u200c\u200d', expect: 'accepted' },

  { name: 'script tag', value: '<script>window.__pwned = 1;</script>', expect: 'accepted' },
  { name: 'img onerror', value: '<img src=x onerror="window.__pwned=1">', expect: 'accepted' },
  { name: 'svg onload', value: '<svg/onload=window.__pwned=1>', expect: 'accepted' },
  { name: 'closing tag soup', value: '</td></tr></table><b>hi', expect: 'accepted' },
  { name: 'sql-ish', value: "'; DROP TABLE yasss_event; --", expect: 'accepted' },
  { name: 'quotes', value: `"double" 'single' \`backtick\``, expect: 'accepted' },
  { name: 'backslashes', value: 'C:\\Users\\nul\\..\\..\\etc', expect: 'accepted' },
  { name: 'json blob', value: '{"a":[1,2,{"b":null}],"c":"}"}', expect: 'accepted' },
  { name: 'template markers', value: '${1+1} {{ctor}} %s %n %%', expect: 'accepted' },
  { name: 'url', value: 'https://example.com/a?b=c&d=e#f', expect: 'accepted' },

  { name: 'emoji zwj', value: '🎉 👩‍👩‍👧‍👦 🏳️‍🌈', expect: 'accepted' },
  { name: 'rtl arabic', value: 'مرحبا بالعالم', expect: 'accepted' },
  { name: 'cjk', value: '日本語の予定表', expect: 'accepted' },
  { name: 'combining marks', value: 'e\u0301\u0301\u0301\u0301', expect: 'accepted' },
  { name: 'bidi override', value: 'start\u202egnirts\u202cend', expect: 'accepted' },
  { name: 'astral plane', value: '𝔘𝔫𝔦𝔠𝔬𝔡𝔢 𝕻𝖑𝖆𝖓𝖊 𝟙', expect: 'accepted' },
  { name: 'lone surrogate-ish', value: 'a\ufffdb', expect: 'accepted' },

  { name: 'newlines', value: 'line one\nline two\nline three', expect: 'accepted' },

  // Every text column server-side is VARCHAR(255) and the server answers
  // `malformed argument (string too long: ...)` past it. The client mirrors
  // server-side checks so the user is told at the field rather than at publish,
  // by which point an entire event has been built on a value that cannot save.
  { name: 'len 255', value: `A${'a'.repeat(254)}`, expect: 'accepted' },
  { name: 'len 256', value: `B${'b'.repeat(255)}`, expect: 'rejected', tooLong: true },
  { name: 'len 1024', value: `C${'c'.repeat(1023)}`, expect: 'rejected', tooLong: true },
];

/** The longest a text column holds server-side. */
export const MAX_TEXT = 255;

/**
 * The same corpus minus the very long entries, for places where several fields
 * are fuzzed together and the runtime would otherwise multiply out.
 */
export const REQUIRED_TEXT_SHORT = REQUIRED_TEXT.filter(
  (c) => !c.name.startsWith('len '),
);

/**
 * Values for an optional free-text field. Blankness is fine everywhere it was
 * not before; length is not, because the column is the same width either way.
 */
export const OPTIONAL_TEXT = REQUIRED_TEXT.map((c) => ({
  ...c,
  expect: c.tooLong ? 'rejected' : 'accepted',
}));

/**
 * Capacity inputs. The field is `<input type="number">`, so the browser filters
 * what can be typed at all — entries that cannot be typed arrive as an empty
 * field, which is itself the case worth covering.
 *
 * CapField clamps to [1, 255] on input, so out-of-range values are expected to
 * be corrected rather than refused. `clamped` records where they should land.
 */
export const CAPS = [
  { name: 'one', typed: '1', clamped: 1 },
  { name: 'two', typed: '2', clamped: 2 },
  { name: 'max', typed: '255', clamped: 255 },
  { name: 'over max', typed: '256', clamped: 255 },
  { name: 'far over max', typed: '99999', clamped: 255 },
  { name: 'zero', typed: '0', clamped: 1 },
  { name: 'leading zeros', typed: '007', clamped: 7 },
  { name: 'fractional', typed: '2.7', clamped: 2 },
  { name: 'negative', typed: '-5', clamped: 1 },
  { name: 'exponent', typed: '1e3', clamped: 255 },
  { name: 'empty', typed: '', clamped: 1 },
];

/**
 * The slot cap is validated rather than clamped — it is a plain number input,
 * not a `CapField` — so out-of-range values are refused with a message.
 */
export const SLOT_CAPS = [
  { name: 'one', typed: '1', expect: 'accepted' },
  { name: 'mid', typed: '42', expect: 'accepted' },
  { name: 'max', typed: '255', expect: 'accepted' },
  { name: 'leading zeros', typed: '007', expect: 'accepted' },
  { name: 'over max', typed: '256', expect: 'rejected' },
  { name: 'far over max', typed: '99999', expect: 'rejected' },
  { name: 'negative', typed: '-5', expect: 'rejected' },
  { name: 'fractional', typed: '2.7', expect: 'rejected' },
  { name: 'exponent', typed: '1e3', expect: 'rejected' },
  // With "unlimited" switched off, these are an empty box rather than a policy.
  { name: 'zero while limited', typed: '0', expect: 'rejected' },
  { name: 'blank while limited', typed: '', expect: 'rejected' },
];

/** Reminder lead time is validated rather than clamped, so it can reject. */
export const LEAD_TIMES = [
  { name: 'blank means default', typed: '', expect: 'accepted' },
  { name: 'minimum', typed: '1', expect: 'accepted' },
  { name: 'a day', typed: '1440', expect: 'accepted' },
  { name: 'maximum', typed: '525600', expect: 'accepted' },
  { name: 'over maximum', typed: '525601', expect: 'rejected' },
  { name: 'zero', typed: '0', expect: 'rejected' },
  { name: 'negative', typed: '-1', expect: 'rejected' },
  { name: 'fractional', typed: '1.5', expect: 'rejected' },
  { name: 'huge', typed: '99999999999', expect: 'rejected' },
];

/**
 * Per-detail-type answers. `expect` is the client verdict for a *required*
 * field; the patterns are anchored mirrors of the server's, so anything the
 * client accepts here must also survive the round trip.
 */
export const DETAIL_ANSWERS = {
  STRING: [
    { name: 'plain', typed: 'hello world', expect: 'accepted' },
    { name: 'blank', typed: '', expect: 'rejected' },
    { name: 'spaces', typed: '   ', expect: 'rejected' },
    { name: 'markup', typed: '<b>bold</b>', expect: 'accepted' },
    { name: 'emoji', typed: '🚀', expect: 'accepted' },
    { name: 'at the column width', typed: 'z'.repeat(255), expect: 'accepted' },
    // `yasss_volunteer_detail.detail_value` is VARCHAR(255) and the endpoint
    // does not check, so this reaches the insert and 500s.
    { name: 'past the column width', typed: 'z'.repeat(300), expect: 'rejected' },
  ],
  INTEGER: [
    { name: 'zero', typed: '0', expect: 'accepted' },
    { name: 'positive', typed: '42', expect: 'accepted' },
    { name: 'decimal', typed: '3.14', expect: 'accepted' },
    { name: 'nine decimals', typed: '1.123456789', expect: 'accepted' },
    { name: 'blank', typed: '', expect: 'rejected' },
    // A number input refuses to hold these, so they land as blank.
    { name: 'letters', typed: 'abc', expect: 'rejected' },
  ],
  EMAIL: [
    { name: 'plain', typed: 'someone@example.com', expect: 'accepted' },
    { name: 'uppercase is lowercased', typed: 'SOMEONE@EXAMPLE.COM', expect: 'accepted' },
    { name: 'plus tag', typed: 'a+b@example.co.uk', expect: 'accepted' },
    { name: 'blank', typed: '', expect: 'rejected' },
    { name: 'no at sign', typed: 'not-an-email', expect: 'rejected' },
    { name: 'no tld', typed: 'a@b', expect: 'rejected' },
    { name: 'embedded in prose', typed: 'mail me at a@b.com ok', expect: 'rejected' },
    { name: 'double at', typed: 'a@@b.com', expect: 'rejected' },
    { name: 'leading dot', typed: '.a@b.com', expect: 'rejected' },
    { name: 'space inside', typed: 'a b@c.com', expect: 'rejected' },
  ],
  PHONE: [
    { name: 'ten digits', typed: '5551234567', expect: 'accepted' },
    { name: 'dashed', typed: '555-123-4567', expect: 'accepted' },
    { name: 'parens', typed: '(555)123-4567', expect: 'accepted' },
    { name: 'dotted with country', typed: '+1.555.123.4567', expect: 'accepted' },
    { name: 'blank', typed: '', expect: 'rejected' },
    { name: 'too short', typed: '12345', expect: 'rejected' },
    { name: 'letters', typed: '555-CALL-NOW', expect: 'rejected' },
    { name: 'embedded in prose', typed: 'call 5551234567 now', expect: 'rejected' },
  ],
};

/** Addresses for the reminder opt-in, which uses the same anchored pattern. */
export const REMINDER_EMAILS = [
  { name: 'plain', typed: 'volunteer@example.com', expect: 'accepted' },
  { name: 'uppercase', typed: 'VOLUNTEER@EXAMPLE.COM', expect: 'accepted' },
  { name: 'blank while anonymous', typed: '', expect: 'rejected' },
  { name: 'garbage', typed: 'nope', expect: 'rejected' },
  { name: 'trailing space is trimmed', typed: 'v@example.com   ', expect: 'accepted' },
  // Chromium punycodes an IDN inside `input[type=email]` before the app ever
  // sees it: `v@exämple.com` arrives as `v@xn--exmple-cua.com`, which is plain
  // ASCII and correctly accepted by both tiers. The browser is doing the right
  // thing here, so the expectation is 'accepted' -- see the dedicated test.
  { name: 'unicode domain, punycoded by the browser', typed: 'v@exämple.com', expect: 'accepted' },
];

/**
 * Addresses for the account fields.
 *
 * `patterns.ACCOUNT_EMAIL` is anchored and lowercase-only on purpose: it mirrors
 * a Java pattern compiled without CASE_INSENSITIVE, and the two tiers have to
 * agree about every one of these or a user is told different things depending on
 * how far their input got.
 */
export const ACCOUNT_EMAILS = [
  { name: 'empty', value: '', expect: 'rejected' },
  { name: 'spaces only', value: '   ', expect: 'rejected' },
  { name: 'no at sign', value: 'ada.example.com', expect: 'rejected' },
  { name: 'no tld', value: 'ada@localhost', expect: 'rejected' },
  { name: 'double at', value: 'ada@@example.com', expect: 'rejected' },
  // RFC-legal and refused by both tiers. In the corpus as an agreement test:
  // the client must not start accepting what the server will not.
  { name: 'quoted local part', value: '"ada smith"@example.com', expect: 'rejected' },
  // The legacy pattern was unanchored, so this matched and then 400'd server
  // side. Pins the anchoring.
  { name: 'address inside a sentence', value: 'hello ada@example.com world', expect: 'rejected' },
  // Accepted, and correctly so: Chromium punycodes an IDN inside
  // `input[type=email]` before the app sees it, so `ada@exämple.com` arrives as
  // `ada@xn--exmple-cua.com` -- plain ASCII, which both tiers take. The pattern
  // is still ASCII-only, so an IDN typed anywhere the browser does not normalise
  // would be refused; that is recorded in docs/remaining-work.md.
  { name: 'non-ascii domain, punycoded by the browser', value: 'ada@exämple.com', expect: 'accepted' },
  { name: 'over the column width', value: `${'a'.repeat(250)}@example.com`, expect: 'rejected' },

  { name: 'plain', value: 'ada@example.com', expect: 'accepted' },
  { name: 'uppercase, normalised', value: 'ADA@EXAMPLE.COM', expect: 'accepted' },
  { name: 'padded, trimmed', value: '  ada@example.com  ', expect: 'accepted' },
  { name: 'plus tagged', value: 'ada+e2e@example.com', expect: 'accepted' },
];

/**
 * Passwords, against the deployment's configured minimum.
 *
 * The minimum is published by `GET /v1` and applied only where a password is
 * *set* — never at login, where enforcing it would lock out an account created
 * under a lower one. These assume the shipped default of 8.
 */
export const PASSWORDS = [
  { name: 'empty', value: '', expect: 'rejected' },
  { name: 'single character', value: 'x', expect: 'rejected' },
  { name: 'one under the minimum', value: 'hunter7', expect: 'rejected' },

  { name: 'exactly the minimum', value: 'hunter78', expect: 'accepted' },
  // Must not be trimmed: the derived key is over the exact bytes, so silently
  // stripping the padding would change the account's credential.
  { name: 'padded', value: '  spaced  ', expect: 'accepted' },
  { name: 'astral emoji', value: '🔐🔐🔐🔐🔐🔐🔐🔐', expect: 'accepted' },
  { name: 'very long', value: 'p'.repeat(1024), expect: 'accepted' },
];

/**
 * Values with an explicit expectation about what the server *stores*.
 *
 * Publishing successfully is not the same as storing faithfully: a title can
 * come back truncated, re-encoded or with its non-ASCII replaced by `?` and
 * every "did it save" assertion in the suite still passes. These pin the
 * round trip itself.
 *
 * `stored` is written down rather than computed, because the two tiers do not
 * agree on what whitespace is and neither is wrong. Java's `String.strip()`
 * uses `Character.isWhitespace`; JS `trim()` uses the ECMAScript WhiteSpace
 * set. Measured against JDK 17 and node 24, the differences are exactly:
 *
 *   - `trim()` removes U+00A0, U+2007, U+202F and U+FEFF; `strip()` keeps them.
 *   - `strip()` removes U+001C-U+001F; `trim()` keeps them.
 *
 * So a value's stored form cannot be derived client-side, and guessing at it
 * is how a test ends up asserting the bug.
 */
export const UNICODE_ROUNDTRIP = [
  { name: 'ascii', sent: 'Plain Title', stored: 'Plain Title' },
  { name: 'emoji zwj', sent: '🎉 👩‍👩‍👧‍👦 🏳️‍🌈', stored: '🎉 👩‍👩‍👧‍👦 🏳️‍🌈' },
  { name: 'astral plane', sent: '𝔘𝔫𝔦𝔠𝔬𝔡𝔢 𝕻𝖑𝖆𝖓𝖊 𝟙', stored: '𝔘𝔫𝔦𝔠𝔬𝔡𝔢 𝕻𝖑𝖆𝖓𝖊 𝟙' },
  { name: 'cjk', sent: '日本語の予定表', stored: '日本語の予定表' },
  { name: 'rtl arabic', sent: 'مرحبا بالعالم', stored: 'مرحبا بالعالم' },
  { name: 'combining marks', sent: 'e\u0301\u0301\u0301\u0301', stored: 'e\u0301\u0301\u0301\u0301' },
  { name: 'bidi override', sent: 'start\u202egnirts\u202cend', stored: 'start\u202egnirts\u202cend' },
  { name: 'zero width', sent: 'a\u200b\u200c\u200db', stored: 'a\u200b\u200c\u200db' },
  { name: 'markup', sent: '<img src=x onerror="window.__pwned=1">', stored: '<img src=x onerror="window.__pwned=1">' },
  { name: 'quotes and backslashes', sent: `"d" 'a' \`b\` C:\\n`, stored: `"d" 'a' \`b\` C:\\n` },
  { name: 'inner newlines', sent: 'line one\nline two', stored: 'line one\nline two' },

  // The whitespace divergences, each asserted in the direction it actually
  // goes. These are the cases that would silently pass a computed expectation.
  { name: 'ascii padded', sent: '  padded  ', stored: 'padded' },
  { name: 'nbsp padded', sent: '\u00a0padded\u00a0', stored: '\u00a0padded\u00a0' },
  { name: 'figure space padded', sent: '\u2007padded\u2007', stored: '\u2007padded\u2007' },
  { name: 'narrow nbsp padded', sent: '\u202fpadded\u202f', stored: '\u202fpadded\u202f' },
  { name: 'bom padded', sent: '\ufeffpadded\ufeff', stored: '\ufeffpadded\ufeff' },
  { name: 'en quad padded', sent: '\u2000padded\u2000', stored: 'padded' },
  { name: 'ideographic space padded', sent: '\u3000padded\u3000', stored: 'padded' },
  { name: 'unit separator padded', sent: '\u001fpadded\u001f', stored: 'padded' },
];

/**
 * The width of a text column, in the units each tier counts.
 *
 * `VARCHAR(255)` counts characters, so 255 astral-plane characters fit -- even
 * though they are 510 UTF-16 code units, which is what `String.length()` would
 * have measured.
 */
export const LENGTH_BOUNDARIES = [
  { name: '255 ascii', sent: 'a'.repeat(255), accepted: true },
  { name: '256 ascii', sent: 'a'.repeat(256), accepted: false },
  { name: '255 astral', sent: '🎉'.repeat(255), accepted: true },
  { name: '256 astral', sent: '🎉'.repeat(256), accepted: false },
];
