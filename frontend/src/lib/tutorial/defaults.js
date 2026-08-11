/**
 * The tutorial's built-in copy, one entry per step id.
 *
 * These are what a deployment shows when its operator has configured no
 * `texts.tutorial` file, or has configured one that says nothing about a
 * particular step. `PublicTextEndpoint` logs and carries on when a text is
 * unconfigured (`YasssCore.java:470`), so that is not an error state -- it is
 * the default state of every deployment until somebody writes the file, and a
 * tutorial that renders an empty panel there would be worse than no tutorial.
 *
 * Markdown, because the deck that overrides them is markdown and both go
 * through the same renderer. Keep them plain: an operator rewriting one of
 * these should not have to reverse-engineer the formatting.
 */
export const DEFAULT_COPY = {
  // --- organizer -----------------------------------------------------------
  welcome: `## Welcome to Yasss!

This is a **practice event**. It only exists in this browser tab — nothing here
is saved, nobody else can see it, and you can click anything you like.

An event is a grid. Down one side, the things that need doing. Along the top,
when they need doing. People claim the squares.`,

  grid: `## The grid is the whole idea

Each row is an *activity* — something that needs a person. Each column is a
*time window*.

Every square where the two meet is a slot somebody can claim. Add an activity
and you get a new row; add a window and you get a new column.`,

  cells: `## Four kinds of square

- **Available** — free, click to claim it.
- **Booked** — you have claimed it.
- **Full** — as many people as you asked for.
- **Unavailable** — you switched this one off, so nobody can sign up.

Try clicking an available square now. Nothing here is real.`,

  paging: `## More than four things to do

The grid shows four activities at a time, whatever size your screen is. Add a
fifth and the slider appears to reach the rest.

Everything is still there — the grid scrolls sideways rather than shrinking, so
the squares stay big enough to tap.`,

  structure: `## Changing it later

Once an event is published you can still edit it: **Modify Event** turns the
grid into an editor where you can add activities, add windows, set how many
people each square takes, and ask volunteers extra questions.

Changes you make there save as you go.`,

  share: `## Getting people to it

Every event has a link and a short code. Send either one.

People who follow the link do not need an account — they type their name and
claim squares. The code is for saying out loud.`,

  'as-a-volunteer': `## What your volunteers see

This is it — the same grid, from the other side. They add themselves here, answer
anything you asked, and pick their squares.

Everything you just set up is what shapes this view: the questions you added, the
caps you set, the windows you chose.`,

  // --- volunteer -----------------------------------------------------------
  'v-welcome': `## Somebody sent you a link

This is a **practice event** — it only exists in this tab, so you can try
everything safely before doing it for real.

You are looking at what needs doing, and when. Your job is to pick the bits you
can help with.`,

  'v-add': `## Add yourself

Start by telling the event who you are. You do not need an account — a name is
enough.

If you are signing up other people as well as yourself, you can add each of them
separately.`,

  'v-fields': `## Answering the organizer's questions

Organizers can ask for extra details — what you are bringing, a phone number,
whatever the event needs. Required ones have to be filled in before you can
submit.

We have filled this one in for you.`,

  'v-paging': `## There may be more than you can see

This event has more activities than fit across the screen. Drag the slider to
reach the rest — the ones you want may be off to the side.

Anything you have already claimed stays claimed while you scroll.`,

  'v-claim': `## Claim your squares

Click any **Available** square to take it. Click it again to let it go.

Nothing is sent yet — you can change your mind as much as you like first.`,

  'v-submit': `## Send it

**Submit** is what actually tells the organizer. Until you press it, everything
you have picked is only on this page.

The button counts what is waiting, and grays out when there is nothing to send.`,

  'v-done': `## That is all of it

You can come back to the same link later to change your answers or give up a
square.

If the organizer asked for your email, you can also have a reminder sent before
the event starts.`,
  // --- builder -------------------------------------------------------------


  'b-summary': `## Title and description

The editor is open now — this is what **Modify Event** gives you, and most of
what follows lives here rather than on the grid.

**Edit Summary** holds the title and description. The title is the heading
people see and the thing that appears in your dashboard; the description is the
paragraph underneath it.

The description is where the detail goes — where to park, what to bring, who to
ask. People read it once, at the moment they are deciding whether to sign up.`,

  'b-notify': `## Getting told when somebody signs up

*Do you want to be notified when someone signs up?* emails you on every signup.

Useful for a small event where each person matters. Less useful for a big one:
forty volunteers is forty emails, and the sign-in sheet tells you the same thing
in one page whenever you want it.`,

  'b-one-each': `## One signup each, or several

*Allow multiple volunteers per signup* decides whether one person can add more
than one name.

Leave it on and somebody can sign up themselves and their two children in one
go. Turn it off and it is one entry each — which the server enforces by account
if they are signed in, and by network address if they are not.`,

  'b-timezone': `## Which clock the times are in

An event has a **time zone**. Everybody sees the same instant, rendered in that
zone, with a note above the grid when it is not their own.

It matters more than it sounds. Set an event up while travelling, or on a
machine with the wrong zone, and without this every time on it is wrong by
however far you were from home.`,

  'b-reminders': `## Reminders

**Reminder lead time** is how long before a window people get a nudge — in
minutes, so 1440 is a day.

Reminders are double opt-in: a volunteer asks for them, confirms by email, and
can unsubscribe from any of them. You choose when they go out; they choose
whether they arrive.`,

  'b-activity': `## Activities are the columns

**Add an Activity** for each thing that needs a person: *Set up*, *Serve*,
*Wash up*.

Give it a description and it becomes the tooltip on that column's header — the
place to put the detail that does not fit in two words.`,

  'b-caps': `## Two caps, and they are not the same

- **Activity Volunteer Cap** — the most people across the *whole* activity, all
  windows together. Use it when you need six bakers in total and do not care
  when they bake.
- **Slot Volunteer Cap Default** — the most people in any *one* square. Use it
  when you need two people serving at a time.

Leave either blank for no limit.`,

  'b-slot-cap': `## Overriding one square

Click any square while you are editing and you can set a cap for that square
alone, regardless of the activity's default — or switch the square off entirely
so nobody can claim it.

A square that is off reads **Unavailable** to everybody.`,

  'b-reorder': `## Order is what people see

Activities can be moved left and right from their own editor. The order you set
is the order volunteers read, and the first column is the one everybody looks at
first.

Put the thing you most need filled where it will be seen.`,

  'b-window': `## Windows are the rows

**Add a Window** for each stretch of time: Saturday morning, Saturday afternoon.

A window has a start and an end. Once the *first* window on an event has passed,
the event counts as expired — the grid stays readable but nobody can sign up or
change anything.`,

  'b-fields': `## Asking people something

**Add a Field** puts a question on the signup form. Five kinds:

- **Text** — anything at all.
- **True/False** — a checkbox.
- **Whole Number** — how many chairs, how many hours.
- **Email Address** and **Phone Number** — checked for shape, so a typo is
  caught while they are still on the page.`,

  'b-required': `## Required, and in what order

A field can be **required**, and then nobody can submit without answering it.
Ask for the minimum: every required field is a reason somebody gives up.

Fields can be reordered here too, and they appear to volunteers in the order you
put them.`,

  'b-report': `## The sign-in sheet

**View Report** is a printable page of who signed up for what, with their
answers to your questions.

Only you can see it. It is the thing to print on the morning of the event and
carry around on a clipboard.`,


  'b-expiry': `## When an event expires

An event expires when its first window begins. After that the page still works
and the report still prints, but nothing can be signed up for or changed.

That is deliberate: an event in progress should be a record of what was agreed,
not something that can move under the people doing it.`,

  'b-dashboard': `## Finding it again

Signed in, everything you have organized is listed on the front page. That is
the way back to an event whose link you have lost.

It is also the reason to sign in before you publish — see the next step.`,

  'b-delete': `## Deleting it

An event can be deleted from its editor, and it takes every signup with it.
There is no undo and no copy kept anywhere.

If you only want to stop people signing up, letting it expire does that on its
own.`,

  'b-publish': `## Publishing

**Publish Event** is the moment it becomes real and the link starts working.

If you are not signed in, read the warning it shows you. An event published
anonymously has no owner, and nobody — including you — will ever be able to edit
it again. Signing in first takes a few seconds and is the difference between an
event you can fix and one you cannot.`,

  'b-done': `## That is the tour

The grid, every setting behind it, and what the people you invite will see.

Nothing you did here was saved — it only ever existed in this tab. When you build
a real one, sign in first, so you can come back and change it.`,

  // --- poll ----------------------------------------------------------------

  // --- voter ---------------------------------------------------------------
  //
  // Written for somebody who was sent a link and has no idea what a "poll" is
  // in this product. It never mentions the editor, because they will never see
  // one.

  'vo-welcome': `## Somebody wants to know when you are free

This is a **poll**. It is not a sign-up — nothing here commits you to doing
anything. Whoever made it is trying to pick a time, and they want to know which
of these would work for you.

This one is practice. Nothing you do goes anywhere.`,

  'vo-grid': `## Days across, times down

Each column is a day the organizer offered. Each row is a starting time.

A square is one of those times on one of those days. There is no end time — the
question is only whether you could make the start.

If there are more days than fit, drag the slider to see the rest.`,

  'vo-pick': `## Click everything that works

Tick **every** square you could make, not just the one you like best. That is
the whole point: the more you can offer, the easier it is to find something that
suits everybody.

A column marked **All Day** means any time that day.

Times are shown as the organizer set them. If they pinned the poll to a
particular time zone, you will get a picker to read them in your own.`,

  'vo-answer': `## Who you are

Put your name in so the organizer knows whose answer this is.

They may have asked for other things too — a phone number, a note. Anything
marked required has to be filled in before you can send it.`,

  'vo-once': `## One answer each

Most polls take one answer per person. If you try to answer twice, you will
usually be told you already have.

Be honest about this rather than clever: it is a courtesy, not a lock, and
stuffing a poll only produces a time that does not actually suit anybody.

If the organizer allowed it, you can come back and change your answer later.`,

  'vo-submit': `## Send it

Nothing is recorded until you submit — clicking squares only moves a selection
around on your screen.

Polls can have a deadline. Once it passes, the poll closes and no more answers
go in, so do not sit on it.`,

  'vo-results': `## What everybody else said

If the organizer chose to show results, you will see how many people can make
each square once you have answered.

Some polls hide this until the deadline, and some never show it at all. That is
the organizer's choice, and it is enforced by the server — not just hidden on
the page.`,

  'vo-done': `## That is all there is to it

Read the grid, tick everything that works, put your name on it, send it.

This was a practice poll and nothing was recorded. The real one will look exactly
like this.`,

  'p-welcome': `## A poll finds the time

An event says *this is happening on Saturday, who can help*. A poll asks the
question before that: **when should this happen at all?**

People vote for every time that suits them, you look at the tally, and then you
build the event. This is a practice poll — nothing here is saved.`,

  'p-scope': `## Days, or dates

A poll asks about one of two things, and you choose which when you create it:

- **Days of the week** — "which mornings generally work?"
- **Specific dates** — "which of these four days can you make?"

It cannot be changed afterwards. The columns would stop meaning anything, and so
would every vote already cast on them.`,

  'p-columns': `## Every column is a day

The grid works the way the event grid does, with one difference: the columns are
days rather than activities, and the rows are times of day rather than stretches
of time.

More than four days and the slider appears, exactly as it does for activities.`,

  'p-time-mode': `## Whose clock?

- **Wall clock** — nine o'clock means nine o'clock wherever you are. Right for a
  group who are all in one place, and nothing is ever converted so nothing can
  be converted wrongly.
- **A fixed time zone** — you name the zone, and people elsewhere see the time
  converted into theirs.`,

  'p-viewer-zone': `## Reading it from somewhere else

On a poll with a fixed zone, anybody can switch which zone they are reading it
in. The poll's own time stays on the first line and theirs appears underneath.

If the conversion crosses midnight you will see a **(+1d)** — because on a
weekday poll that means a different day entirely, and hiding it would tell
somebody they are free when they are not.`,

  'p-all-day': `## All Day

Every column header has an **All Day** checkbox. Tick it and the times in that
column grey out: you are asking whether the whole day works, not which hour.

Turning it back off restores exactly the squares you had. Nothing is lost by
trying it.`,

  'p-window': `## Times are just start times

The poll's editor is open now. **Add a Time** asks for one thing: when it starts. There is no end time, because
a poll is settling the hour and the length is the event's business afterwards.`,

  'p-repeat': `## Repeat through the day

Tick **Repeat** and give an interval, and one time becomes a column of them —
every ninety minutes from nine, say.

**Until** says where to stop, and the time you name is offered: “every hour
until five” gives you a five o’clock row. Leave it empty to carry on to the end
of the day. You cannot set it earlier than the time you started at.

It will not accept an interval longer than the span you have given it. Asking to
repeat every eight hours starting at six in the evening is a mistake, and it
says so rather than quietly making one row.`,

  'p-apply': `## Which days a time applies to

By default a new time is offered on **every** day. You can pick particular days
instead.

And there is a separate box: *...and any day I add to this poll later*. That one
is a standing rule, not a list — a day you add next week picks the time up on
its own.`,

  'p-cells': `## Available and unavailable

A square where a time is offered on a day reads **Available**, and anybody can
vote for it. A square where it is not reads **Unavailable**.

Click the squares that suit you. You can pick as many as you like — that is the
point of a poll.`,

  'p-fields': `## Asking respondents something

Back in the editor: a poll can ask its own questions, exactly as an event can, with the same five
kinds of field.

Keep it short. Somebody answering a poll is doing you a favour on their way to
something else.`,

  'p-deadline': `## A deadline

A poll can have a **deadline**. After it, nobody can answer or change an answer.

Worth knowing: a poll about days of the week has no dates in it, so a deadline
is the *only* thing that can ever close one. Without one it stays open forever.`,

  'p-one-answer': `## One answer each

*Allow more than one answer per person* is on by default. Turn it off and we
will try to stop people answering twice — by network address, and by a
characteristic of their browser.

We say plainly what that is worth: **it is trivial to bypass.** Anybody with a
second browser can answer again. If it genuinely matters, ask people to sign in.`,

  'p-edit-answers': `## Changing your mind

*Let people change their answer afterwards* decides whether somebody can come
back and revise what they said.

Leave it on for a planning poll, where people's weeks change. Turn it off when
the first answer is the one that counts.`,

  'p-visibility': `## Who sees the results

Six choices, from **only me** to **anyone with the link, at any time**.

Two of them only make sense with a deadline, and the form will tell you so. One
of them — respondents seeing the tally after the poll closes — means people have
to sign in to answer, because it is the only way we can still recognise them
later.

Showing a running tally changes how people vote. That is sometimes what you
want, and it is worth deciding on purpose.`,

  'p-publish': `## Publishing a poll

**Publish Poll** makes it real and starts the link working, exactly as it does
for an event — and with the same warning if you are not signed in. A poll
published anonymously can never be edited again.`,

  'p-code': `## The same box as an event

A poll gets a link and an eight-character code, and **the code goes in the same
box on the front page that an event code goes in**.

Whoever you send it to does not need to know which of the two they are holding.`,

  'p-answer': `## Answering one

Click the squares that suit you, then **Answer This Poll** and put your name to
it. One person, one answer — however many squares that answer covers.

If the poll asks questions of its own, they are on the same form.`,

  'p-results': `## Reading the tally

Every offered time, best first, with how many people chose it.

The denominator is everybody who answered, not the best row — somebody can
answer and pick nothing, which is a real reply meaning *none of these work*, and
leaving them out would flatter your best time.`,

  'p-done': `## That is polls

Ask when, get an answer, then build the event.

Nothing you did here was saved.`,
};
