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

That is the whole tour. Have a poke around; nothing you do to this practice event
goes anywhere.`,

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
};
