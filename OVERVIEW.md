# Usabilify

**Your tests pass. Your users still get stuck.**

Usabilify gives you a panel of AI beta testers, each one a different kind of person, who try your app on every build. They are built as close to real people as we can make them: what they can see, how they can act, what they already know, and how long they'll put up with it. They attempt the tasks your users come to do, think out loud while they do it, and give up when a person like them would. You get a dashboard of where each kind of person got stuck and why, and a replay of any session narrated in their own voice.

---

## Why green tests don't mean usable

Automated testing has reached the point where everything looks fine right up until a human arrives. That isn't because the tests are wrong. It's because a test is a very strange user.

| A test… | A person… |
|---|---|
| Sees everything on the page, pixel-perfect, instantly | Might be red-green color blind, zoomed to 200% and still squinting, or hearing the page one line at a time |
| Clicks a button by its selector, even when it's 11px and light grey | Has to notice it first, then hit it with a thumb on a moving bus |
| Already knows where everything is | Has never seen this app, and may not know a gear means Settings |
| Reads a toast the instant it appears | Looks back at the screen two seconds later, after it has gone |
| Never gets frustrated and never leaves | Walks away after the third wrong turn |
| Asserts that the setting changed | Needs to *know* it changed |

Every row is a gap a functional test cannot see through, and every row is a real way products fail. Usabilify exists to close those gaps, one layer at a time.

## What that looks like

> **Dana**, 42, office manager, red-green color blind, trying to turn off a weekly email:
>
> *"Weekly report email, there it is. Four toggles, all olive-ish with the knob in the middle. Is that on or off? Can't tell."*
>
> She clicks it. *"Okay, it got a bit darker, but the knob didn't move. Is that on or off now? No idea."*
>
> The setting did change. The end-to-end test for this toggle passes. Dana never knew it worked, so she left the page not trusting it. That is a usability failure with a green build.

## How close to a person is it?

Most synthetic-user tools scale the number of personas: hundreds, thousands, millions of profiles. Usabilify goes the other way. It has a small panel built with care, because every published failure of synthetic users is a failure of a shallow one: a paragraph of prompt in front of a capable model.

A Usabilify persona isn't a prompt that says "act color blind". It is a model of a person with parts you can open. Each part is a number or a rule, enforced in code rather than asked of the model, and each has a stated source or is marked as an estimate to be fitted. Every layer below exists because a test that skips it lets a failure through. The full list of parts, with sources and status, is in [docs/persona-model.md](docs/persona-model.md).

**What they can see.** A sighted persona never sees the real screenshot. It sees the frame after it has been run through a published color-vision model (Machado, Oliveira and Fernandes, 2009, at the persona's severity), blurred to a stated sigma for low vision, and pulled toward grey for reduced contrast. A low-vision persona also gets the viewport a 200%-zoomed browser would. A blind persona gets no image at all, only the page as a screen reader would announce it, so a `div` with a click handler and no role is announced as plain text, exactly as it would be for Ray. A persona cannot react to what it cannot perceive.

**How they can act.** Each persona has a fixed set of moves. A keyboard-only persona can only press keys, so a menu that isn't focusable is unreachable, not merely awkward. A phone persona taps with thumb-sized error, drawn from a distribution, so a 20px gear gets missed for real and the persona has to notice it missed. Nobody can click a hidden element, and an action outside a persona's modality is refused and recorded.

**How fast they look back.** People don't watch the screen the instant something happens. A novice looks back about two seconds after acting; an expert in well under one. Anything that appeared and vanished in between is reported to the persona as "something flashed up and disappeared", not as its text. A toast that lasts 1.5 seconds is confirmed for the test and missed by Walt.

**What they already know.** A novice is told, in plain words, which conventions it doesn't have: that a circle with initials is a menu, that a plus sign adds something, that a gear means settings. It isn't allowed to use the web knowledge a model carries by default. Every persona is told it doesn't know where things are in this app and not to pretend otherwise.

**How much they'll put up with.** Patience is a budget. Wrong turns, dead clicks, slow pages and feeling lost spend it. Progress gives a little back. The persona never sees a number, only how it feels right now, and it gives up when a person with that temperament would, not when a step counter runs out. A 27-year-old on a bus has far less to spend than a support lead who lives in admin tools.

**Whether they know they succeeded.** When the task's success check passes, the persona gets one more look at the screen before the session ends. That's how a session can finish as "completed, but they didn't realise it", which is Dana's outcome above, and the one tests can never report.

**How they sound.** Short, first-person, no design vocabulary. The persona says "ugh, which one is on?" A separate analyst pass turns that into "toggle state shown only by red/green color". The persona never sounds like a consultant, because real participants don't.

## How closeness is checked

"As close as possible to a person" invites the question "how close?" The answer is measured, not asserted, and in layers:

1. **Rules that need no model.** A red-green color blind persona that confidently names red or green, a screen-reader persona that describes layout, an action outside its modality, or jargon in its speech is flagged automatically on every session.
2. **A judge.** Each session is scored on realism (would an experienced researcher believe a human said this?), grounding (is everything the persona described actually in the frame it saw?), voice (does it sound like this particular person?), and give-up timing (would someone like this plausibly stop here?).
3. **Human labels.** The judge's verdicts are compared with blind human labels per criterion, so you know how far to trust it before you trust it.
4. **A real-versus-generated test.** Reviewers see excerpts of real and generated think-aloud shuffled together and try to tell which is which. If they can, the personas aren't close enough yet, and we know where to work.

Today the measuring instruments are built and the first two run on every session. The human-label and real-versus-generated steps need real transcripts and labels before their numbers mean anything. See "What's honest to say today" below.

## What you get from a run

- **An outcome per session:** completed, completed without realising it, gave up, believed they were done but weren't, or ran out of steps.
- **The think-aloud monologue**, step by step, with every click, keypress, missed tap and page change.
- **What the persona actually saw**, beside what was on screen: the color-blind frame, the blurred frame, or the screen reader's announcements.
- **Findings** in product language, merged across personas into ranked issues, each backed by quotes from the people who hit it.
- **A narrated replay**, rendered on demand, that opens at the moment it went wrong, in the persona's own voice. Export it as an MP4 when a meeting needs ending.
- **Trends.** The monitor tracks failure rates and give-ups per kind of user across runs and alerts when one kind starts to fail.

## Where it sits

These aren't competing tools. They are a sequence, and each one answers a question the one before can't.

| Layer | Answers | Can't answer |
|---|---|---|
| **Unit and end-to-end tests** | Does it work? | Can anyone find it? |
| **Accessibility linters** | Does the markup follow the rules? | What is it like to use with that impairment? |
| **Analytics and session replay** | What did our existing users do? | Why, and what about the users we don't have yet |
| **Usabilify** | Can different kinds of people find it, use it and know they've succeeded? On every build, in minutes. | It's a simulation. It gets you close, and tells you how close. |
| **Real users** | The real thing | Rarely, slowly, and hardly ever with the users you most need |

Run Usabilify continuously to catch what tests pass over. Spend your real-user sessions on the questions it raises.

## Who it's for

- **Product managers** who want to know whether a flow works for real people before it ships, and to see a regression the week it lands rather than the quarter after.
- **Designers** who want evidence instead of opinions. A replay of Dana squinting at olive toggles ends the argument about whether the toggle needs a label.
- **Accessibility leads** who need to show what an inaccessible flow feels like, not list its violations. This matters more as rules like the European Accessibility Act are enforced.
- **Engineering leads** who want the human layer to run like the rest of the suite: on a schedule, on a preview deploy, with a cost cap.

## What a run looks like

On the included demo app, a small admin tool with six usability problems planted on purpose:

| | |
|---|---|
| Panel | 7 personas: an expert control, color blind, older first-time user, phone on a bus, low vision, keyboard only, screen reader |
| Tasks | 3: invite a teammate, turn off a weekly email, change your display name |
| Sessions | 21 |
| Wall time | about 3 minutes |
| Cost | about $1.25 to run, plus about $0.55 to analyze |
| Planted problems found | 5 of 6 |

The one it missed was a role field whose only error is a red border. Every persona filled in the role before submitting, so the error never appeared. That's a finding about the test design, not something to hide.

It also found problems nobody planted. The settings gear is too small to hit with a thumb. The add-member button is an unlabeled plus sign. Nothing confirms that a display name was saved. A functional suite with full coverage would have passed all three.

## How you use it

1. **Point it at your app** and describe a few tasks, each with a simple success check ("a member with this email exists").
2. **Pick personas** from the library, or add your own. Describe a person in a sentence and Claude drafts the profile for you to review, with a live preview of your app through their eyes and a sample of their voice.
3. **Run.** Sessions run in parallel. Each one records a structured trace, not a video, so runs are fast and cheap.
4. **Review the dashboard.** Success by run, outcomes by persona, where each kind of person failed, with filters and run-to-run comparison.
5. **Watch the failures.** Open any cell to replay the session from the moment it went wrong, narrated.
6. **Keep watching.** The monitor raises an alert when a kind of user starts to fail.

## What's honest to say today

- **It is a simulation.** Personas are constrained to perceive, act and tire like people with these traits, but a persona is not a person. Treat findings as strong leads, and confirm the important ones with real users.
- **Fidelity is built to be measured, and not yet measured on real data.** The rules and the judge run today. Judge-versus-human agreement and the real-versus-generated test need real transcripts and labels before the realism numbers mean anything. Until then, "as close as possible" is a design goal with instruments attached, not a verified number.
- **The demo results are on a planted app.** Recovering 5 of 6 planted problems shows the mechanism works. Evidence about real products comes from running it on apps with known, documented problems and comparing.
- **Single runs are noisy.** The same persona can succeed one run and give up the next, as people do. Run several trials before trusting a single cell.

## Getting started

```sh
npm install
npx tsx src/cli.ts run acme --trials 3      # run the demo panel against the demo app
npx tsx src/cli.ts analyze acme <run>       # findings and issues
npx tsx src/cli.ts serve                    # dashboard on http://localhost:4310
```

Requirements are Node 22, Google Chrome, and the Claude Code CLI signed in. A two-minute narrated tour is in `walkthroughs/tour-walkthrough.mp4`. The design, and what was learned building it, is in [plan.md](plan.md).
