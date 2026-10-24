# What a persona is made of

A Usabilify persona is not a paragraph of prompt. It is a model of a person with parts you can open: each part is a number or a rule in `personas/<id>/persona.json`, each is enforced in code rather than requested of the model, and each has a stated source or is marked as a hand-set estimate. This document lists the parts, what each one does, where its value comes from today, and how it will be fitted to real data.

Status legend: **literature** (taken from a published model), **estimate** (set by hand, to be fitted), **fitted** (calibrated on real sessions; none yet).

---

## 1. What they see: `perception.transforms`

The model never sees the real screenshot. Every frame is transformed before it reaches the persona, and the transformed frame is saved beside the real one so a reviewer can see exactly what the persona saw. Code: `src/runner/transform.ts`.

| Transform | What it does | Source | Status |
|---|---|---|---|
| `cvd` (protan, deutan, tritan, severity 0–1) | A 3×3 matrix applied in linear RGB, interpolated toward identity by severity. Dana runs at deutan severity 1.0. | Machado, Oliveira & Fernandes (2009), *A Physiologically-based Model for Simulation of Color Vision Deficiency*. Matrices are the published severity-1.0 values. | literature |
| `blur` (sigma in CSS px) | Separable gaussian blur, scaled by device pixel ratio so sigma stays in CSS pixels. Lou runs at 1.6; Walt at 0.6 for mild age-related loss. | Sigma values chosen by eye to make 11px text unreadable (Lou) or effortful (Walt). | estimate |
| `contrast` (0–1) | Pulls every channel toward mid grey. Lou runs at 0.55. | Chosen so the 11px #c9ccd3 "edit" link in the demo app disappears. | estimate |
| viewport | A real Playwright viewport. Lou gets 640×400 at 2× scale, which is what a 200%-zoomed browser shows. Priya gets 390×844 with touch. | Device sizes are real; the 200% zoom for low vision is a common setting, not a measured population figure. | estimate |

A blind persona gets no image at all. `virtualBuffer` in `src/runner/perceive.ts` walks the DOM and produces the page as a screen reader would announce it: headings with levels, "link, Settings", "edit text, Email, blank", "toggle button, Weekly report, pressed", tables row by row. A `div` with a click handler and no role is announced as plain text, because that is what a screen reader does. Ray cannot find the avatar menu in the demo app for exactly this reason.

The prompt then tells the persona what the frame already is ("the screenshot is already as blurry as you see it; if you can't read something, say so") so it doesn't reason its way around the transform. A rule check flags a deutan persona that confidently names red or green anyway.

## 2. How they act: `modality` and `input.misclick`

Each modality has a closed set of actions. Code: `src/runner/act.ts`.

| Modality | Can do | Cannot do |
|---|---|---|
| sighted | click (x, y), type, press, scroll, select, back | act on anything not in the frame |
| keyboard | press, type, select | click or scroll with a pointer |
| screen-reader | activate [ref], fill [ref], select, press, back | anything without an announced ref |

An action outside the modality is refused, recorded in the trace, and costs patience. The model can't quietly fall back to a selector.

Clicks land with error. Each click's coordinates are perturbed by a gaussian with `sigmaPx`, and with probability `p` the click slips 18–32px in a random direction. The runner records which element was intended and which was hit; a mismatch is a `misclick` event the persona has to notice and recover from.

| Persona | sigmaPx | p | Source | Status |
|---|---|---|---|---|
| Alex (expert, mouse) | 2 | 0.01 | | estimate |
| Dana (fluent, mouse) | 3 | 0.02 | | estimate |
| Walt (71, mouse) | 5 | 0.06 | | estimate |
| Lou (low vision, zoomed) | 5 | 0.04 | | estimate |
| Priya (phone, thumb) | 10 | 0.05 | Chosen so a 20px icon is missed often and a 44px target (the common minimum-size recommendation) almost never. Not yet checked against touch-accuracy studies; see section 9. | estimate |

## 3. How fast they look back: `knowledge.web` → reaction time

After acting, the runner waits a human reaction time before taking the "after" frame. Code: `reactionMs` in `src/runner/mood.ts`, `settle` in `src/runner/perceive.ts`.

| Expertise | Reaction time | Status |
|---|---|---|
| expert | 800 ms | estimate |
| fluent | 1200 ms | estimate |
| novice | 2200 ms | estimate |

Anything that appeared and disappeared inside that window is reported as missed. A novice is told "something flashed up near the bottom and vanished before you could read it"; a fluent user gets the text as a glimpse. The demo app's 1.5-second invite toast is confirmed for a Playwright assertion and missed by Walt.

## 4. What they already know: `knowledge`

| Field | Effect in the prompt | Status |
|---|---|---|
| `web` novice / fluent / expert | "With computers and the web you are a beginner / comfortable / very experienced." Also sets reaction time. | authored |
| `domain` none / some / expert | "You have never used / used something a bit like / used lots of tools like this kind of app." | authored |
| `conventions` | "Things you're used to: account menus behind the avatar; settings behind a gear." | authored |
| `unknown` | "Things you do NOT know (so don't act as if you do): that a gear icon means settings; that a plus sign adds something; that messages can appear briefly at the bottom." | authored |

Every persona is also told: "You don't know where things are in this app. Don't pretend to." The `unknown` list is the mechanism that stops a capable model from using web conventions a 71-year-old bookkeeper doesn't have. Walt's list is authored from common first-time-user confusions, not from a study of 71-year-olds.

## 5. How much they put up with: `patience`

Patience is a budget. The persona never sees the number, only words. Code: `src/runner/mood.ts`.

| Event | Cost | Detected by |
|---|---|---|
| any step | 0.1 | always |
| wrong turn | `wrongTurnCost` (1.0 for Dana) | navigated to a page not on the task's baseline path, first visit |
| backtrack | half of wrongTurnCost | pressed back, or returned to a visited page |
| dead click | `deadClickCost` (1.0) | acted on the page and nothing changed (URL, focus, or more than ~200 px) |
| refused action | half of deadClickCost | action outside the modality |
| slow page | `slowLoadCost` (0.5) | settle took over 2 s |
| felt stuck or lost | 0.3 | the persona's own reported feeling |
| progress | refunds `progressGain` (0.5), capped at budget | reached a new page on the baseline path |

Frustration is 1 − patience/budget, and is rendered as one of five phrases from "You're fine" to "You've had enough of this. You'd normally walk away now." The persona is told to let that colour what it says and when it stops. Budgets today: Alex 9, Dana 7, Kim 7, Ray 7, Walt 6, Lou 6, Priya 5.

Status: **estimate**. Budgets and costs were set so that the expert control almost never gives up and Priya gives up on the third or fourth wrong turn. The judge scores give-up timing on every session ("would a real person like this plausibly give up at this point?"), which is the signal we will fit against once real abandonment data exists.

## 6. Whether they know they succeeded

When the task's success check passes, the persona gets one more look before the session ends. If it had already said `give_up`, the outcome is "completed" with the reason "Finished without realising it" and an `unaware-of-success` event. If it says `done` and the check fails, the outcome is `wrong-done`. Code: `src/runner/loop.ts`. These two outcomes are the ones no assertion can report.

## 7. How they sound: `voice`, `temperament`, `voice.md`

The prompt forbids design vocabulary and demands short spoken fragments under 25 words. `temperament` and `context` set how the person talks and what else is on their mind. `voice.md` holds sample lines the model is told not to copy.

Status: **authored**. Every `voice.md` is marked `AUTHORED sample lines, not from real sessions`. Replacing them with consented think-aloud excerpts from real users of each kind is the first fitting step, and the same transcripts feed the real-versus-generated deck.

The rule checks (`src/judge.ts`) flag jargon, lines over 30 words, and an average over 24 words. The judge then scores whether the lines sound like this particular person.

## 8. How the parts are checked

| Check | What it catches | Runs |
|---|---|---|
| Rules | A deutan persona naming red/green confidently. A screen-reader persona using visual language. Actions outside the modality. Jargon and long lines. | every session, free |
| Judge: realism | Would an experienced researcher believe a human said this? | every session, local model, escalates when unsure |
| Judge: grounded | Is everything the persona described actually in the frame it saw? | every session, per line, with the perceived frame |
| Judge: voice | Does it sound like this particular person? | every session |
| Judge: give-up | Would someone like this plausibly stop here? | sessions that gave up |
| Alignment | Judge verdicts vs blind human labels, per criterion | when labels exist (`usabilify align`) |
| Turing deck | Can reviewers tell generated excerpts from real ones? | when real excerpts exist (`usabilify turing`) |

## 9. What "fitted" will mean

The fitting plan, in order:

1. **Voice.** Consented think-aloud excerpts per kind of user replace the authored `voice.md` lines. Feeds the Turing deck at the same time.
2. **Patience.** Give-up step and the events preceding it from real sessions of each kind of user; fit budget and costs so the simulated give-up distribution matches.
3. **Tap error and reaction time.** Replace the estimates with figures from the touch-accuracy and visual-attention literature, cited here, then check against our own real sessions.
4. **Knowledge gaps.** Walt's `unknown` list from what real first-time users of that age actually ask about, not from our intuition.

Real data is aggregated by kind of user and consented. A persona is calibrated on people like Dana. It is never a copy of a particular Dana.
