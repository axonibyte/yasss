# Yet Another Service Scheduling System (YASSS)

Copyright (c) 2024-2026 CrowdEase, LLC.

This system is designed as an open source alternative to other proprietary
volunteer scheduling systems that are available on the web. This platform allows
organizations to create their own volunteer sign-up sheets, and for volunteers
to sign up for predefined time slots and optionally receive reminders.

# Potential Upcoming Features

The poll feature shipped with several capabilities deliberately left out. They
are recorded here with what each would actually cost, so the decision to add one
is made on evidence rather than rediscovered from scratch.

**Turning a finished poll into an event.** Once a poll settles on a time, the
obvious next step is creating the event it was asking about, and the schema
makes that mechanical. This is the only item on the list with a timing cost: a
`poll.resulting_event` column is cheap to add alongside the existing poll
migrations and progressively more awkward afterward. Worth deciding early even
if the answer is no.

**Notifying a poll's creator when somebody answers.** Polls currently send no
email at all, so a creator learns of responses only by looking. Events have the
whole apparatus already -- `Mail`, `ReminderConsent`, templates -- so this is
mostly a matter of choosing which of those parts a poll should reuse.

**Offering the same weekday twice in a relative poll.** A unique index on
`(poll, day_of_week)` means "two different Tuesdays" cannot currently be
expressed. Supporting it means dropping that index and giving options an
explicit sequence number, since the weekday would no longer identify a column.

**Reaping relative polls that have no deadline.** Such a poll stays open
forever: it has no dates to pass and nothing sweeps it. Harmless today, but it
shapes what a long-lived dashboard eventually shows.

**The creator's exemption from the single-answer cap.** A poll's owner may
always answer, mirroring how events treat theirs. That is what lets somebody
answer their own poll, and it equally lets them answer it repeatedly. Revisit
only if a poll is ever meant to bind its creator.

**Result visibility and anonymous answering.** Choosing
`RESPONDENT_ALL_AFTER_CLOSE` requires respondents to sign in, because a
browser-local edit token is not a durable identity across the gap between
submitting an answer and the deadline passing. Any alternative needs a real
identity that survives that gap, not a longer-lived token.

# License

This project is licensed under the terms of the
[Mozilla Public License, v. 2.0](https://www.mozilla.org/en-US/MPL/2.0/).
