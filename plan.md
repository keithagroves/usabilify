# Plan: Usabilify

Synthetic usability testing. A library of realistic agentic users (personas) runs your web app with real goals. Each session is recorded as a structured trace: what the persona saw, what it said to itself, what it did, and whether it got there. You review the sessions that failed, watch a narrated replay rendered after the fact, and hear where the persona got stuck and why.

The personas are the product. The replay and the dashboard are how you look at what they found.

---

## 0. Review (2026-10-23, before implementation)

Changes made to this plan after checking it against the machine and anim's code:

1. **Brain backend.** There is no Anthropic API key here; anim calls headless Claude Code. The actor runs as one **persistent `claude -p` session per persona session** over stream-json, sending each step's view as an image block. Tested: images work, history is kept, about a second per turn on Haiku. Ollama (gemma4, qwen3-vl) is a second backend for free local runs. The API is a third backend later.
2. **Replay does not compile into anim's scene schema.** Anim scenes are model-authored and cue-driven; a replay is data-driven and its timing comes from the trace. Coupling to anim's engine would mean learning and pinning its schema for little gain. Instead the replay is a self-contained player whose frame is a pure function of `t` (anim's principle 3), shown live in the dashboard and exported to MP4 by stepping `t` in Playwright and muxing with ffmpeg. Anim's Kokoro venv is reused for voices.
3. **A fixture app with planted issues.** M1 and M2 need an app to test, and section 9.4 needs known failures. `fixtures/acme` is a small admin app with five documented usability problems (`studies/acme/known-issues.json`). It is the first calibration target, not a real-world validity claim.
4. **Transforms in linear RGB.** The Machado CVD matrices are defined on linear RGB, so frames are linearised, transformed and re-encoded with pngjs (pure JS, no native build) rather than sharp's sRGB `recomb`.
5. **Screen-reader persona uses a virtual buffer**, not the raw accessibility tree: a linear list of headings, landmarks, links, controls and text with their names and states, numbered so the persona can act on them. Closer to what a screen reader announces, and the persona cannot see layout.
6. **False success is an outcome.** When the persona says it is done and the success predicate disagrees, the session is `wrong-done`. That is a worse failure than giving up, and the plan did not name it.
7. **Style files are authored, not real.** No real think-aloud transcripts are available offline. Each `voice.md` holds authored sample lines, marked as such, to be replaced with lines from real sessions. The Turing check ships as a mechanism with an empty real-excerpt set until those exist.
8. **Out of scope for this pass:** M7 (CI on preview deploys) and the canary loop in the monitor.

### Implementation status (2026-10-23)

| milestone | state | notes |
|---|---|---|
| M0 lift and shift | done | stats, judge cascade, labels/alignment and monitor re-implemented in anim's shape for session traces |
| M1 one persona, one task | done | expert persona finished create-user in 10 steps, $0.09, 36 s |
| M2 first real persona | done | deuteranopia persona saw "a murky olive pill", couldn't tell on from off, completed without knowing it |
| M3 replay | done | browser player (frame = f(t)), Kokoro voice per persona, plain/split/persona lenses, MP4 export (~5 s for a 40 s replay) |
| M4 analyst and dashboard | done | per-session findings, run-level issue merge, known-issue recall, grid, needs-attention list, session view opening at the stuck step, blind labelling |
| M5 calibration | mechanism done | rubric v1, rules + local judge with letter-order debiasing, alignment table, Turing deck. No human labels or real transcripts yet, so nothing is trusted |
| M6 more personas | done | 7 personas: expert control, deutan, novice, phone, low vision, keyboard-only, screen reader |
| M7 CI | not started | |

First full runs on the fixture (21 sessions each, one trial, about $1.25 per run plus $0.55 analysis): 5 of 6 planted issues recovered. The missed one (role error shown only as a red border) was never triggered: every persona opened the role dropdown before submitting.

Lessons from the first runs, now fixed:
- Dead clicks must be judged by what changed on screen and where focus went, not DOM mutation counts (apps rewrite attributes on every click), and with a small threshold (a 44×24 toggle flip is 0.1% of the frame).
- The analyst blamed controls for the persona's simulated mis-clicks. Transcripts now say where the persona aimed and that the slip was motor error, so it becomes a target-size finding, not "the gear does nothing".
- Read a control's accessible name before activating it; activation can re-render the page.
- Don't give the answer in the task text ("they should be a regular member") or the error path never runs.
- With one trial, outcomes swing between runs (the novice gave up on create-user in one run and finished in the next). Use `--trials 3` before believing a cell.
- The local judge passes nearly everything. Expected; it stays untrusted until it agrees with human labels.

---

## 1. Principles

1. **Simulate the audience, not taste.** A persona that fails a task is evidence. An opinion about the layout is not. Usabilify never says "this is ugly"; it shows a user who could not find the button. The designer's taste is theirs. We give it something to be tested against.
2. **Personas are more than prompts.** A persona is a perception transform, an input modality, a knowledge level, a patience and mood model, and a voice. "You are color blind" in a prompt does nothing. A deuteranopia matrix applied to the screenshot before the model sees it does.
3. **Actor and analyst are separate.** The persona speaks in the first person, in fragments, with no UX vocabulary. A later pass turns "ugh, which one is on?" into a finding about state encoded only by color. Neither leaks into the other.
4. **The trace is the source of truth. Video is a view.** Sessions record a small structured trace, never pixels. Replays are rendered on demand, only for sessions someone opens, and can be re-rendered with a different lens (the persona's filtered view beside the real one).
5. **Ground every complaint in what the persona could see.** If the monologue says it cannot read the red text, the frame it was given must show the red text washed out, and it must not click the red button two steps later. Consistency is checked, not hoped for.
6. **Realism is measured, not asserted.** The judge-vs-human-labels loop from anim is reused as is. A persona is trusted when humans cannot tell its think-aloud from a real one and its failures predict real user failures.
7. **Failures first.** The interface opens on the tasks that went wrong, and a replay opens at the stuck step, not at the start.
8. **Give-ups are earned.** Patience is a budget that frustration spends. A novice gives up after two wrong turns, an expert after eight. A give-up is never a step counter firing.

---

## 2. Hierarchy

```
Study      — one app, one build under test, a set of tasks and a set of personas
└─ Run       — one execution of the study (one commit, one date): tasks × personas × trials
   └─ Session  — one persona attempting one task once: the unit of record
      └─ Step     — one perceive → think → act cycle, with its frames and monologue line
```

| Unit | Produces | Reviewed as |
|---|---|---|
| Step | before/after frames, persona view, monologue, action, events | a beat in the replay |
| Session | `trace.json`, outcome, metrics, analyst findings | a replay video, rendered on demand |
| Run | aggregate metrics per persona and task, signals | the dashboard grid |
| Study | trend across runs, calibration against real data | the project page |

---

## 3. Pipeline

```
study.json + tasks/ + personas/
        │
        ▼
  1. run        persona runner: perceive → transform → think/speak → act → record   (Playwright, tracing on)
        │
        ▼
  2. grade      deterministic metrics per session (outcome, steps vs baseline, backtracks, confusion, mis-clicks)
        │
        ▼
  3. analyze    analyst pass: monologue + frames → findings (what failed, where, why, severity)
        │
        ▼
  4. report     dashboard: runs × personas × tasks grid, failures first, signals vs thresholds
        │
        ▼
  5. render     on demand: trace → anim scene (session-replay type) → narrated MP4 with cursor, captions, split view
        │
        ▼
  6. calibrate  judge realism against human labels; promote interesting sessions to the gold set
```

Steps 1 to 4 run on every run. Step 5 runs when someone clicks. Step 6 runs when personas, prompts, transforms or the judge change.

---

## 4. Project layout on disk

```
usabilify/
  plan.md
  src/
    cli/usabilify.ts        run | grade | analyze | report | render | serve | eval | monitor
    runner/                 the persona loop (perceive, transform, think, act, record)
      loop.ts
      perceive.ts           screenshot, accessibility tree, DOM settle
      transform/            cvd.ts blur.ts contrast.ts viewport.ts   (perception transforms)
      act.ts                click by coordinate, type, scroll, tab, keypress; mis-click model
      mood.ts               patience budget, frustration, give-up
      actor.ts              the persona prompt: first-person monologue + next action
    analyst/                monologue + frames → findings
    trace/                  trace types, load/save, metrics   (lifted from anim/src/evals)
    evals/                  harness, judge, label, align, stats, promote   (lifted from anim/src/evals)
    monitor/                signals, alerts, analyze, propose   (lifted from anim)
    replay/                 trace → anim scene compiler; calls anim's renderer
    server/                 dashboard + session viewer + labelling UI
  personas/
    <id>/persona.json       traits, transforms, modality, knowledge, patience, voice
    <id>/voice.md           how this person talks: samples from real think-aloud transcripts
    <id>/calibration.md     what this persona has been checked against, and how well it matched
  studies/
    <app>/study.json        base url, launch command, viewport(s), task list, persona list
    <app>/tasks/<id>.json   goal, success predicate, expert baseline (steps, path)
    <app>/runs/<run>/       sessions/<session>/{trace.json, steps/, view/}, report.json
  evals/
    rubric.json             realism + grounding criteria
    cases/                  gold sessions with human labels
    labels/labels.jsonl
  monitor/signals.json
  traces/                   (symlink or index over studies/*/runs/*/sessions)
```

Anim stays where it is. Usabilify imports its renderer and player as a dependency (`anim render`, the preview server) and keeps its own copy of the eval and monitor code, since the trace shape differs.

---

## 5. Data model

### 5.1 `personas/<id>/persona.json`

```json
{
  "id": "dana-deutan",
  "name": "Dana",
  "summary": "42, office manager, uses the web all day but has never seen this app. Red-green color blind (deuteranopia).",
  "modality": "sighted",
  "perception": { "transforms": [ { "type": "cvd", "kind": "deutan", "severity": 1.0 } ] },
  "input": { "pointer": true, "keyboard": true, "misclick": { "sigmaPx": 6, "p": 0.03 } },
  "knowledge": { "web": "fluent", "domain": "none", "conventions": ["gmail", "slack", "salesforce"] },
  "patience": { "budget": 6, "wrongTurnCost": 1, "slowLoadCost": 0.5, "selfBlame": 0.4 },
  "context": "On a laptop at work, has about five minutes before a meeting, has not used this app before.",
  "voice": { "tts": "kokoro:af_sarah", "rate": 1.0, "style": "voice.md" }
}
```

Persona fields and what they drive:

| field | drives |
|---|---|
| `modality` | what the persona receives each step: `sighted` gets a screenshot, `screen-reader` gets the accessibility tree only, `keyboard-only` gets a screenshot and no pointer, `low-vision` gets a screenshot at 200 percent zoom plus blur |
| `perception.transforms` | applied to the frame before the model sees it. The persona view is saved alongside the real frame |
| `input` | which actions are allowed and how precise they are |
| `knowledge` | which conventions the actor may assume. A novice is told it does not know where settings usually live |
| `patience` | the mood model: a budget spent by wrong turns, backtracks and slow loads; give-up when it hits zero |
| `context` | the life around the task: device, time pressure, prior annoyance. This moves the voice more than traits do |
| `voice` | the TTS voice and a style file with real think-aloud samples for few-shot |

### 5.2 `studies/<app>/tasks/<id>.json`

```json
{
  "id": "create-user",
  "goal": "Add a new teammate called Sam Ortiz with the email sam@example.com so they can log in.",
  "start": "/dashboard",
  "success": { "kind": "url+text", "url": "/users", "text": "Sam Ortiz" },
  "baseline": { "steps": 4, "path": ["Settings", "Team", "Invite", "submit"] },
  "maxSteps": 25
}
```

The success predicate is deterministic (URL, text, element, network call, or a small script). The baseline is the expert path, measured once by hand or by an expert persona, and is the denominator for "steps vs baseline".

### 5.3 `trace.json` (one session)

Same shape as anim's trace, with persona and task in place of scene and section.

```json
{
  "id": "ss-20261023-101500-a1b2",
  "ts": "2026-10-23T10:15:00Z",
  "kind": "session",
  "study": "studies/acme",
  "run": "r-20261023-1015",
  "task": "create-user",
  "persona": "dana-deutan",
  "trial": 1,
  "sut": { "app": "acme@3f9c2a1", "runner": "claude-sonnet-5-5@<prompt-hash>", "personaHash": "…" },
  "outcome": { "kind": "gave-up", "atStep": 9, "reason": "Could not find where users are managed." },
  "steps": [
    {
      "i": 3,
      "t": 12.4,
      "frame": "steps/03-before.png",
      "view": "steps/03-view.png",
      "ax": "steps/03-ax.json",
      "say": "Hm. Settings maybe? That's usually where this stuff is.",
      "mood": { "patience": 4.5, "frustration": 0.3 },
      "act": { "type": "click", "x": 1512, "y": 38, "target": "button[aria-label=Settings]", "misclick": false },
      "after": "steps/03-after.png",
      "events": ["navigated:/settings", "settled:420ms"]
    }
  ],
  "metrics": {
    "completed": false,
    "steps": 9,
    "stepsVsBaseline": 2.25,
    "backtracks": 2,
    "wrongTurns": 3,
    "confusionEvents": 4,
    "misclicks": 0,
    "timeToFirstCorrectAction": null,
    "costUsd": 0.41,
    "durationMs": 48000
  },
  "findings": [
    { "severity": "high", "atStep": 5, "kind": "discoverability", "note": "User management lives under Organization, not Settings; persona looked in Settings, the profile menu and the top nav before giving up." }
  ],
  "judge": { "realism": { "pass": true, "p": 0.91 }, "grounded": { "pass": true, "p": 0.97 }, "consistent": { "pass": false, "p": 0.31 } },
  "events": [ { "type": "rendered", "ts": "…", "lens": "split" }, { "type": "label", "ts": "…" } ]
}
```

Monologue is stored before the action it precedes, so the replay says "I'll try the menu" and then moves the cursor.

### 5.4 Events worth recording between actions

A screenshot per action misses what people react to. Also record on DOM settle after each action, on any toast or dialog appearing, on a loading state lasting longer than 800 ms, and on layout shift above a threshold. Each becomes an extra frame on the step so the replay can show the spinner the persona was staring at.

---

## 6. The persona runner

The loop, per step:

```
frame = screenshot(page)                       (or ax tree for screen-reader)
view  = transform(frame, persona.perception)   (cvd matrix, blur, zoom, contrast)
{ say, act, done } = actor(persona, task, history, view, mood)
record(step)
perform(act) with persona.input constraints     (coordinate click with mis-click noise, tab, type)
wait for settle; capture after frame and events
mood = update(mood, outcome of step)           (wrong turn, backtrack, slow load, progress)
if success(page) → completed; if mood.patience <= 0 → gave-up; if steps > max → timed-out
```

**Perception.** Sighted personas click by coordinate on the view, never by selector. That is the only way the persona is limited to what a human sees. The accessibility tree is used only by the screen-reader persona, which never gets a screenshot. The target selector is still resolved after the click and stored on the step for the analyst.

**Transforms.** Color vision deficiency as a 3×3 matrix on the frame (Machado 2009 for protan, deutan, tritan at a given severity). Low vision as zoom plus gaussian blur. Reduced contrast sensitivity as a contrast curve. Viewport as a real Playwright viewport (phone, tablet, narrow laptop). Transforms are pure functions on an image and are unit-tested against known frames.

**Actor prompt.** First person only. No UX vocabulary. Short lines. Does not know it is a test. Does not care about the product. May blame itself. The style file carries a dozen real think-aloud lines for this persona. Knowledge rules tell a novice which conventions it does not know. The actor returns one monologue line and one action per step.

**Mood.** A patience budget spent by wrong turns, backtracks, slow loads and dead ends, replenished a little by visible progress. Frustration rises with spending and shortens the monologue, flattens the tone, and raises the chance of a give-up line. The actor sees the mood as plain words ("you are getting annoyed"), never as numbers.

**Mis-clicks.** A sighted persona's click lands with gaussian noise around the intended point and, with a small probability, on a neighbour. A mis-click is recorded as an event and the actor sees its consequence next step. This is a feature: it produces "oops" and reveals targets that are too small or too close.

---

## 7. The analyst

Runs once per session after the loop. Input: the monologue, the frames, the actions, the task and the baseline. Output: findings with a severity, the step they anchor to, a kind (discoverability, affordance, feedback, color-only state, target size, copy, error recovery, performance), and a one-line note in UX language. The analyst may also flag the session for review when it suspects the persona cheated (knew something it should not have) or contradicted its impairment.

Findings aggregate across sessions: the same finding from seven of ten personas is one row in the report with a count, not seven rows.

---

## 8. Replay rendering

A session replay is an anim video of a new type, `session-replay`, compiled from the trace instead of written by a model.

| trace | anim scene |
|---|---|
| session | one scene |
| step | one section |
| step frames (before, settle, after) | footage: stills or the Playwright clip segment in a framed window |
| monologue line | narration for that section, voiced by the persona's TTS voice |
| action | a cursor object gliding to the click point, timed to the end of the spoken line; a key or tab chip for keyboard actions |
| mood | a small meter beside the window, and the TTS rate and tone |
| persona view | optional second window (split lens): what the persona actually saw |
| findings | highlight rings and a chip at the step they anchor to |
| outcome | an end card: completed, gave up, timed out, with the metrics |

**Time inversion.** Anim is narration first: word timestamps set cue times. A session happened at real times, but since the replay is rendered afterwards we own time. Each section's length is its spoken line plus the action plus a short hold, and the footage between actions is slowed or frozen to fit, the way product-tour slows static shots. Real elapsed time is shown on a clock in the corner so a 40-second stall still reads as a stall.

**Lenses.** `plain` (real frames only), `split` (real beside persona view), `persona` (persona view only). The split lens is the one that sells: the red error text, invisible in the right-hand frame, at the moment the persona says "did it work? nothing happened."

**On demand.** `usabilify render <session> --lens split` compiles, voices, and calls `anim render`. The dashboard renders when a session is first opened and caches the MP4 next to the trace. Nothing is rendered for sessions nobody opens.

The type earns its `video-types/session-replay/` folder in anim, with a guide, after the first replay has been made and reviewed.

---

## 9. Evaluation and calibration

Lifted from anim's evals framework with the criteria changed. Two things are under test: the personas (are they human and consistent?) and the product (does it predict real users?).

### 9.1 Rubric (binary, versioned)

| criterion | passes when |
|---|---|
| `realism` | a reviewer reading the monologue cold would take it for a real think-aloud |
| `grounded` | every complaint refers to something visible in the persona view at that step |
| `consistent` | the persona never acts on information its impairment or knowledge level rules out |
| `voice` | the register matches the persona's style file; no UX vocabulary |
| `giveup_earned` | if it gave up, a reviewer agrees a person like this would have |
| `finding_valid` | the analyst finding points at a real issue a designer would act on |

### 9.2 Judge and alignment

Same cascade as anim: deterministic checks (consistency can be partly automated: did it click an element whose only distinguishing feature was a color it cannot see), then a local typed judge, then Claude only for uncertain criteria. Judge verdicts are compared with human labels per criterion, with Cohen's kappa and fail-recall, and a criterion is trusted only past the same thresholds. The labelling UI hides verdicts until the label is saved.

### 9.3 Turing check

A standing eval: a mixed deck of real think-aloud transcript excerpts and generated ones, unlabelled, shown to reviewers. Report the detection rate per persona. A persona is shippable when reviewers are near chance.

### 9.4 Predictive validity

The number the business runs on. Run the study on apps with documented usability failures (public usability reports, a partner's real session recordings, or our own moderated tests on a small panel) and measure overlap between persona findings and human findings, per persona and per finding kind. Publish it. Re-run it whenever personas, transforms or the runner model change.

### 9.5 Harness

```
usabilify eval run     --cases <ids|tag> --trials 3 --judge --budget-usd 20 --baseline <run>
usabilify eval judge   <run>
usabilify eval label   <run>
usabilify eval align
usabilify eval promote <session>       # a live session becomes a gold case, with its label
```

Reports carry Wilson intervals and paired bootstrap against the baseline, as in anim. Trials per case separate an unreliable persona (pass@k high, pass^k low) from a broken one.

---

## 10. Monitor and dashboard

`monitor/signals.json`, same shape as anim's: each signal has an owner, a threshold, a window and a why.

| signal | what it catches |
|---|---|
| task failure rate per persona | the product regressed for this kind of user |
| give-up rate | the product is too hard for this user before it is wrong |
| steps vs baseline p95 | success that cost too much |
| confusion events per session | successful but painful sessions |
| backtrack rate | wrong paths that look right |
| mis-click rate on a target | targets too small or crowded |
| judge fail on `consistent` or `grounded` | the persona is cheating or hallucinating; findings from it are suspect |
| cost p95 per session | runaway personas |
| drift: steps per session, task length, viewport mix vs gold set | the study has changed shape and the gold set no longer covers it |

The dashboard is the report plus the grid:

- **Grid:** personas down, tasks across, each cell a failure rate with its interval and a sparkline across runs. Failures first, sorted by severity times frequency.
- **Session list** behind a cell: outcome, steps, confusion count, the stuck-step thumbnail.
- **Session view:** the replay player opened at the stuck step, the monologue as a scrollable transcript synced to the scrubber, the persona view toggle, findings as marks on the bar (anim's marks bar: clean, warned, bad), and the label form.
- **Findings view:** aggregated across sessions, each with its count, personas affected, and one click to the best example replay.
- **Persona page:** traits, calibration results, Turing detection rate, predictive validity on known cases.

---

## 11. Interfaces

```
usabilify run      <study> [--tasks ids] [--personas ids] [--trials 1] [--concurrency 4] [--budget-usd 10]
usabilify grade    <run>                     # recompute deterministic metrics (free)
usabilify analyze  <run>                     # analyst pass, findings aggregated
usabilify report   <run> [--baseline <run>]
usabilify render   <session> [--lens plain|split|persona]
usabilify serve    [--port 4310]             # dashboard, session viewer, labelling
usabilify eval     run|judge|label|align|promote
usabilify monitor  [analyze|propose|decide]
usabilify persona  new <id> | check <id>     # scaffold; run the consistency and Turing checks on one persona
```

Later: a GitHub check that runs a study against a preview deploy and comments on the PR with the grid delta. That is the wedge no human-panel service can match.

---

## 12. Tech stack

- TypeScript, tsx, zod, Playwright with the installed Chrome (anim's product-tour notes apply: block analytics, hide dev overlays, viewport equals recording size)
- Runner model: Claude through the API with vision for the actor; the analyst can be a smaller model. Local typed judge through Ollama for the free path, as in anim
- Image transforms: sharp (CVD matrix via `recomb`, blur, resize); unit-tested against reference frames
- TTS: Kokoro locally (anim's vo pipeline) with one voice per persona; word timestamps drive cursor timing
- Rendering: anim's deterministic renderer and preview server, invoked as a dependency
- Storage: files on disk, one folder per session, same as anim's traces; a SQLite index later if the grid gets slow
- Dashboard: anim's server pattern (node http plus esbuild), plain HTML, no framework until it hurts

---

## 13. Milestones

**M0. Lift and shift (days).** Copy anim's trace, eval, monitor and stats code into `src/`, retype the trace for sessions, get `usabilify report` printing an empty grid. Decide the import boundary with anim's renderer.

**M1. One persona, one task, one site.** The runner loop end to end with Playwright tracing on. A sighted persona with no transforms, clicking by coordinate, monologue logged per step, deterministic metrics, success predicate. Run it against a real app ten times and read the traces. Expect the monologue to sound like a consultant and the persona never to give up. Fix those before moving on.

**M2. The first real persona.** Deuteranopia transform, mood and patience, mis-click model, the style file with real think-aloud lines, the knowledge rules. The proof: a control run finds the red error text and the deutan persona misses it, and the monologue line at that step is one a person would say. This is the demo.

**M3. Replay.** The trace-to-scene compiler, the `session-replay` type, TTS per persona, the split lens. First rendered replay reviewed, guide written. Player opens at the stuck step.

**M4. Analyst and dashboard.** Findings per session, aggregation across sessions, the grid, the session view, the labelling UI. Monitor signals wired up.

**M5. Calibration.** Rubric and judge aligned to human labels. Turing deck. First predictive validity number against a product with documented failures. Persona pages show their numbers.

**M6. More personas.** Screen reader (accessibility tree only), keyboard only, low vision, phone viewport, novice with suppressed conventions, expert used to a named competitor. Each ships with a calibration file.

**M7. CI.** Study against a preview deploy on each PR, grid delta as a comment, cost cap per run.

---

## 14. What is reused from anim

| anim | usabilify | change |
|---|---|---|
| `src/evals/{traces,harness,judge,label,align,stats,promote,metrics}.ts` | `src/trace`, `src/evals` | trace type and metrics retyped for sessions; rubric replaced |
| `monitor/signals.json`, `src/evals/monitor.ts` | `src/monitor` | signals replaced |
| `video-types/product-tour` recorder (`record.mts`, `mark()`) | runner's capture | marks become steps; recording is incidental, the trace is primary |
| renderer, player, marks bar, `anim render` | `src/replay` | called as a dependency, never forked |
| vo pipeline (Kokoro, word timestamps, voice graders) | per-persona TTS | one voice per persona; word timings drive the cursor |
| docs/evals.md judge design (cascade, letter debiasing, blind labelling, versioned judges) | section 9 | unchanged |

Not reused: explainer and diagram types, section agents, hero metaphors, looks and palettes, score. A replay should look plain.

---

## 15. Open questions

- Click by coordinate from a screenshot: how often does the model miss on current vision models, and is the miss rate inside what the mis-click model should add, or already above it?
- How do we suppress learned web conventions for a novice persona without making it stupid? Knowledge rules in the prompt, or a retrieval filter on what it may recall?
- Where do real think-aloud transcripts for the style files come from? Public usability research, our own small panel, or recorded sessions a partner shares.
- Does the screen-reader persona use a real screen reader's output (virtual buffer order, announcements) or the raw accessibility tree? The former is far more faithful and much more work.
- Session replays for keyboard-only and screen-reader personas have no cursor. What is the visual language: a focus ring glide, a transcript of announcements?
- Per-session cost target for CI use. Likely under a dollar, which bounds steps and frame size.

---

## 16. Risks

- **Personas that always succeed.** The model is patient and knows the web. If M1 shows a near-100 percent completion rate on a task real users fail, the whole product is a mirror. Mitigations: mood budget, knowledge rules, coordinate-only perception, and the Turing and consistency checks as gates on every persona change.
- **Monologue that is performed, not perceived.** Confabulated complaints that do not match the view. Mitigation: the `grounded` and `consistent` criteria, partly deterministic, run on every session, with a persona's findings marked suspect when they fail.
- **Caricature.** A cartoon novice or a colour-blind persona that cannot read anything is both insulting and useless. Mitigation: transforms from the literature, style files from real transcripts, and reviewers who have the impairment where possible.
- **Validity never measured.** Without the predictive validity number the product is vibes. Mitigation: M5 is a milestone, not a nice-to-have, and the number is on the persona page.
- **Inheriting too much of anim.** The replay turns into a film. Mitigation: section 14's boundary; a replay has no palette, no score, no hero.
- **Cost.** Dozens of vision calls per session across many personas and tasks. Mitigation: budget caps on every run, small frames, a cheaper analyst, render only on open.
