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
 *
 * **Write for the screen the step puts you on.** The two creation tracks open
 * the real dialogs and build the practice model as they go, so a step's copy
 * can say "this field", "the switch below", "press Add" and mean something the
 * reader is looking at. Copy that describes a control from a screen it is not
 * on reads as a non sequitur -- which is what the poll track did before this,
 * and what got it rewritten.
 */
export const DEFAULT_COPY = {
  // --- organizer -----------------------------------------------------------
  //
  // Builds an event from the front page: settings, then a row, then columns,
  // then the questions, then publish. That order is the product's, not the
  // tour's -- an activity cannot have slots before there is a window for them
  // to sit in -- so a tour that taught any other sequence would be teaching one
  // the app refuses.
  welcome: `## Welcome to Yasss!

You are on the front page, and over the next few steps we are going to build an
event right here. Nothing is saved, nobody else can see it, and you can click
anything you like.

An event is a grid: along the top, the things that need doing; down the side,
when they need doing. People claim the squares.`,

  'b-create': `## Everything starts here

**Create Event** is in the menu at the top of every page, whether you are signed
in or not.

Press it yourself if you like. Either way, pressing Next opens it — and what
comes up is the real form, filled in with an example so you can see what each
answer is for.`,

  'b-summary': `## Title and description

The title is the heading people see, and the name this event has in your
dashboard. The description underneath is where the detail goes: where to park,
what to bring, who to ask.

People read that paragraph once, at the moment they are deciding whether to
sign up. Everything below it on this form is a setting, and the next few steps
take them one at a time.`,

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

An event has a time zone. Everybody sees the same instant, rendered in that
zone, with a note above the grid when it is not their own.

It matters more than it sounds. Set an event up while traveling, or on a
machine with the wrong zone, and without this every time on it is wrong by
however far you were from home.`,

  'b-reminders': `## Reminders

**Reminder lead time** is how long before a window people get a nudge — in
minutes, so 1440 is a day.

Reminders are double opt-in: a volunteer asks for them, confirms by email, and
can unsubscribe from any of them. You choose when they go out; they choose
whether they arrive.`,

  grid: `## Saved — and here is your event

**Save** closed the form and put you on the event itself. It is empty, and it
says so: an event has no shape until you give it one.

Two things fill it. A *window* is a stretch of time and becomes a row. An
*activity* is something that needs a person and becomes a column. Windows
first, because an activity needs somewhere to sit.`,

  'b-window': `## Windows are the rows

**Add a Window** opens this, and it wants a start and an end: Saturday morning,
Saturday afternoon.

Once the *first* window on an event has passed, the event counts as expired —
the grid stays readable, but nobody can sign up or change anything after that.

Press **Save Window**, or press Next and we will.`,

  'b-activity': `## Activities are the columns

That window is on the grid behind this now — one row. **Add an Activity** opens
this second form, for the other axis.

One activity per thing that needs a person: *Set up*, *Serve*, *Wash up*. Give
it a description and that becomes the tooltip on the column header, which is
where detail that will not fit in two words goes.`,

  'b-caps': `## Two caps, and they are not the same

- **Activity Volunteer Cap** — the most people across the *whole* activity, all
  windows together. Use it when you need six bakers and do not care when.
- **Slot Volunteer Cap Default** — the most people in any *one* square. Use it
  when you need two people serving at a time.

Leave either blank for no limit.`,

  'b-columns': `## One column each

There they are: one highlighted column per activity, each with a square for
every window.

The tour added six of them so you can see what a full grid looks like. The
column headers are buttons — click one while you are building and you get that
activity's settings back.`,

  cells: `## Every square is a slot

The highlighted one is *Set up*, in the first window — one activity, one time.
It shows how many people have claimed it out of how many you asked for.

Click a square while you are building and you can override that one on its own,
which is what the next step opens.`,

  'b-slot-cap': `## Overriding one square

This is what a square opens. **Enable Slot** switches it off entirely, so
nobody can claim it — the two-till on a stall that has not opened yet.

**Slot Volunteer Cap** overrides the activity's default for this square alone. A
square that is switched off reads **Unavailable** to everybody.`,

  paging: `## More than four things to do

The grid shows four activities at a time, whatever size your screen is. Add a
fifth and the slider appears to reach the rest.

Everything is still there — the grid scrolls sideways rather than shrinking, so
the squares stay big enough to tap.`,

  'b-reorder': `## Order is what people see

The first column is the one everybody looks at first. Activities can be moved
left and right from their own editor — open one and you get arrows.

Put the thing you most need filled where it will be seen.`,

  'b-fields': `## Asking people something

**Add a Field** puts a question on the signup form. Five kinds:

- **Text** — anything at all.
- **True/False** — a checkbox.
- **Whole Number** — how many chairs, how many hours.
- **Email Address** and **Phone Number** — checked for shape, so a typo is
  caught while they are still on the page.`,

  'b-required': `## Required, and in what order

Turn this on and nobody can submit without answering. Ask for the minimum:
every required field is a reason somebody gives up halfway.

Fields can be reordered from the table on the event page, and they reach
volunteers in the order you put them.`,

  'b-publish': `## Publishing

**Publish Event** is the moment it becomes real and the link starts working.

If you are not signed in, read the warning it shows you. An event published
anonymously has no owner, and nobody — including you — will ever be able to edit
it again. Signing in first takes seconds and is the difference between an event
you can fix and one you cannot.`,

  share: `## It is live

Published. The buttons across the top are what you get afterwards, and
**Share** is the one to reach for first: every event has a link and an
eight-character code, and either one gets somebody in.

People who follow the link do not need an account. The code is for saying out
loud.`,

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

It is also the reason to sign in before you publish, rather than after.`,

  structure: `## Changing it later

A published event is not frozen. **Modify Event** puts you back into the same
building surface you have just been using — add activities, add windows, change
a cap, ask another question.

Changes there save as you go. There is no second Publish.`,

  'as-a-volunteer': `## What your volunteers see

The same grid from the other side, and the squares change vocabulary:
**Available** to claim, **Booked** once they have, **Full** at the cap you set,
**Unavailable** where you switched one off.

Everything you just set up is what shapes this view — the questions you added,
the caps, the windows.`,

  'b-done': `## That is the tour

You built an event from an empty form: settings, a window, activities, caps, a
question, and a link to send.

Nothing here was saved — it only ever existed in this tab. When you build a real
one, sign in first, so you can come back and change it.`,

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
separately. Next opens the form.`,

  'v-form': `## Just a name

That is the whole requirement. No account, no password, no email unless the
organizer asked for one.

If you want reminding before the event, there is a switch further down the form
— you give an address, confirm it once by email, and can unsubscribe from any
reminder afterwards.`,

  'v-fields': `## Answering the organizer's questions

Organizers can ask for extra details — what you are bringing, a phone number,
whatever the event needs. Anything marked required has to be filled in before
the form will submit.

You can close this without filling anything in; the tour has somebody ready for
you to be.`,

  'v-picker': `## That is you, on the event

Everyone you have added shows up here, and whichever one is selected is the one
your next click claims a square for.

Signing up a family? Add each of them, then switch between them as you pick
squares.`,

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

  // --- poll ----------------------------------------------------------------
  //
  // The same shape as the organizer track and for the same reason: a poll is
  // created, not encountered, and every setting worth explaining lives in a
  // form that only exists while you are creating one.
  'p-welcome': `## A poll finds the time

An event says *this is happening on Saturday, who can help*. A poll asks the
question before that: **when should this happen at all?**

People vote for every time that suits them, you read the tally, and then you
build the event. We are going to make one now, from this page. Nothing is
saved.`,

  'p-create': `## Everything starts here

**Create Poll** is in the menu at the top, right above Create Event.

Press it yourself if you like. Either way, pressing Next opens it — and what
comes up is the real form, filled in with an example so you can see what each
answer is for.`,

  'p-scope': `## Days, or dates

Here is the form, filled in with an example. Its first question is the one you
cannot take back:

- **Days of the week** — "which mornings generally work?"
- **Specific dates** — "which of these four days can you make?"

We picked days of the week. It cannot change once the poll exists: the columns
would stop meaning anything, and so would every vote on them.`,

  'p-days': `## These become your columns

Seven buttons, one per day, and the ones you pick are the columns of the grid
you are about to get. We have taken Monday to Friday.

Pick generously. A poll is asking people to find overlap, and every day you
leave out is overlap that cannot be found.`,

  'p-time-mode': `## Whose clock?

- **Wall clock** — nine o'clock means nine o'clock wherever you are. Right for
  a group in one place, and nothing is ever converted so nothing converts wrong.
- **A fixed time zone** — pick this and a zone list appears. Everyone else gets
  a picker to read the poll in their own zone, with the poll's time above and
  theirs below, and a **(+1d)** when the conversion crosses midnight.`,

  'p-deadline': `## A deadline

Optional, and this is the field for it. After it passes, nobody can answer or
change an answer.

Worth knowing before you leave it blank: a poll about days of the week has no
dates in it, so a deadline is the *only* thing that can ever close one. Without
one it stays open forever.`,

  'p-visibility': `## Who sees the results

Six choices in this list, from **only me** to **anyone with the link, at any
time**.

Two of them only make sense with a deadline, and the form says so if you pick
one without setting it. One — respondents seeing the tally after the poll
closes — means people have to sign in to answer.`,

  'p-one-answer': `## One answer each

This switch is on by default. Turn it off and we will try to stop people
answering twice, by network address and by a characteristic of their browser.

The form tells you what that is worth, and so will we: **it is trivial to
bypass.** Anybody with a second browser can answer again. If it genuinely
matters, ask people to sign in.`,

  'p-edit-answers': `## Changing your mind

The switch below decides whether somebody can come back and revise what they
said.

Leave it on for a planning poll, where people's weeks change under them. Turn it
off when the first answer is the one that counts.

That is the whole form. **Start building** takes you to the grid.`,

  'p-columns': `## Every column is a day

**Start building** closed the form, and this is the grid it made: one
highlighted column per day you picked. Nothing is highlighted on the left,
because that column is the time axis and it is still empty.

Five days against four visible columns, so there is a slider underneath. The
days are all still there; it pages rather than shrinking.`,

  'p-window': `## Now the times

**Add a Time** is how rows get onto the grid. A poll's row is a *start time* and
nothing else — there is no end, because a poll settles the hour and the length
is the event's business afterwards.

Press it, or press Next and we will open it for you.`,

  'p-window-start': `## Times are just start times

One field: when it starts. That is the whole of what a poll row is.

We have opened this with a repeat already switched on, so the next two steps
have something real to point at. The rest of the form is what that repeat
needs.`,

  'p-repeat': `## Repeat through the day

**Repeat** turns one time into a column of them. The interval is hours and
minutes; **Until** says where to stop, and the time you name is offered — "every
four hours until five" gives you a five o'clock row.

Leave Until empty to run to the end of the day. It refuses an interval longer
than the span you gave it, and says so rather than quietly making one row.`,

  'p-apply': `## Which days a time applies to

By default a new time goes on **every** day. *Only the days I pick* narrows it
to the columns you choose.

The checkbox underneath is a different kind of thing: *...and any day I add to
this poll later* is a standing rule, not a list. A day you add next week picks
this time up on its own.`,

  'p-cells': `## Available and unavailable

Three rows, exactly what the preview promised. Every *highlighted* square is
offered and anybody will be able to vote for it; the unhighlighted ones read
**Unavailable** and nobody can.

Click a highlighted one now and it turns into the other — that is you saying no
to that particular time on that particular day. Click again to put it back.`,

  'p-all-day': `## All Day

Every column header has an **All Day** checkbox — the slider has moved so you
can see one already ticked. Tick it and that column's times gray out: you are
asking whether the whole day works, not which hour.

Turning it back off restores exactly the squares you had. Nothing is lost by
trying it.`,

  'p-fields': `## Asking respondents something

**Add a Question** opens this. A poll can ask its own questions, with the same
five kinds of field an event has and the same *required* switch.

Keep it short. Somebody answering a poll is doing you a favor on their way to
something else, and every extra box is a reason to close the tab.`,

  'p-publish': `## Publishing a poll

**Publish Poll** makes it real and starts the link working, exactly as it does
for an event — and with the same warning if you are not signed in.

A poll published anonymously has no owner and can never be edited again. Sign in
first.`,

  'p-code': `## The same box as an event

Published. A poll gets a link and an eight-character code, and **the code goes
in the same box on the front page that an event code goes in**.

Whoever you send it to does not need to know which of the two they are holding.
**Share** has both.`,

  'p-answer': `## Answering one

**Answer This Poll** opens this, and this is what your respondents get: their
name, plus any question you asked. They tick squares on the grid first, then
fill it in.

One person, one answer — however many squares that answer covers. You can answer
your own poll, and this is how.`,

  'p-results': `## Reading the tally

Every offered time, best first, with how many people chose it.

The denominator is everybody who answered, not the best row — somebody can
answer and pick nothing, which is a real reply meaning *none of these work*, and
leaving them out would flatter your best time.`,

  'p-done': `## That is polls

You built one from an empty form: days, times, a repeat, a question, and a code
to send. Ask when, read the tally, then build the event.

Nothing here was saved.`,

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

Each highlighted column is a day the organizer offered. Each row down the left
is a starting time.

A square is one of those times on one of those days. There is no end time — the
question is only whether you could make the start. If there are more days than
fit, drag the slider.`,

  'vo-pick': `## Click everything that works

Tick **every** square you could make, not just the one you like best. That is
the whole point: the more you can offer, the easier it is to find something that
suits everybody.

A column marked **All Day** means any time that day. Times are shown as the
organizer set them.`,

  'vo-answer': `## Who you are

This form opens when you are ready to send. Put your name in it, so the
organizer knows whose answer this is.

They may have asked for other things too — a phone number, a note. Anything
marked required has to be filled in before it will send.`,

  'vo-once': `## One answer each

This poll takes one answer per person, and it says so here. If you try to answer
twice you will usually be told you already have.

Be honest about it rather than clever: it is a courtesy, not a lock, and
stuffing a poll only produces a time that does not actually suit anybody.`,

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
};
