# Usabilify

**Your tests pass. Your users still get stuck.**

Usabilify gives you a panel of AI beta testers, each a different kind of person, who try your web app on every build. A persona is not a prompt that says "act color blind": it is a model of a person with parts you can open. What it sees is transformed before the model sees it. What it can do is limited by its modality and its hands. What it knows is declared. How long it puts up with you is a budget it spends. Each session is recorded as a structured trace; you review the failures in a dashboard and watch a narrated replay in the persona's own voice, with what they saw beside what was on screen.

Start with [OVERVIEW.md](OVERVIEW.md) for the pitch, [docs/persona-model.md](docs/persona-model.md) for what a persona is made of, and [plan.md](plan.md) for the design and its review.

## Quick start

```sh
npm install
npx tsx src/cli.ts run acme --concurrency 4          # 7 personas × 3 tasks against the fixture app
npx tsx src/cli.ts analyze acme <run>                # findings per session, issues across the run
npx tsx src/cli.ts report acme <run>                 # grid in the terminal
npx tsx src/cli.ts serve                             # dashboard on http://localhost:4310
```

Requirements: Node 22, Google Chrome, the `claude` CLI logged in (the personas run as headless Claude Code sessions; no API key needed), ffmpeg for MP4 export. Voices use Kokoro from `~/projects/anim/vo/.venv` (set `ANIM_PY` to point elsewhere); without it, macOS `say` is used. The judge uses a local Ollama model (`gemma4:e4b`).

## Commands

| command | what it does |
|---|---|
| `init <study> [--url <app>] [...]` | scaffold a study for any app: probes the URL, warns about sign-in and hash routing, asks for a first task; every answer can be a flag |
| `run <study> [--tasks] [--personas] [--trials] [--brain]` | run sessions; `--brain ollama:qwen3-vl:4b` runs free and local (weaker) |
| `grade <study> <run>` | recompute deterministic metrics (free) |
| `analyze <study> <run>` | analyst pass and known-issue recall |
| `report <study> [<run>] [--baseline <run>]` | personas × tasks failure rates with Wilson intervals |
| `judge <study> <run>` | realism, grounding, consistency and voice verdicts (rules + local judge) |
| `align` | judge vs human label agreement per criterion |
| `persona list` / `persona check <id>` | personas; consistency and voice summary for one |
| `turing --n 20` | build a real-vs-generated deck (needs `evals/turing/real.jsonl`) |
| `monitor [<study>]` | evaluate signals over recent runs, append alerts |
| `voice <session>` / `render <session> --lens split` | voice a session; export a narrated MP4 |

## Personas in the dashboard

The Personas page lists every persona with its input method, vision, device, patience, success rate and checks. **New persona** opens a form for who they are, how they use the app, vision, knowledge, patience, voice and which studies they belong to. It can draft the fields from a one-line description with Claude, and it previews the study's start page through the persona's eyes and plays sample lines in its voice. Edits apply to the next run; past sessions keep the persona hash they ran with.

## Testing Usabilify with Usabilify

`studies/usabilify` points the personas at this dashboard with three product-manager tasks: find the most serious problem, find out whether the latest build regressed, and watch a specific persona give up. It's how the overview got its shape: the first run showed every persona leaving the overview to answer "did anything get worse?", so the overview now leads with that answer. Run it after changing the dashboard:

```sh
npx tsx src/cli.ts serve &                      # the personas use the live dashboard
npx tsx src/cli.ts run usabilify --trials 2
npx tsx src/cli.ts analyze usabilify <run>
npx tsx src/cli.ts report usabilify <run> --baseline <previous run>
```

## Layout

- `personas/<id>/persona.json` and `voice.md`: who each persona is, how it perceives and acts, its patience and its voice.
- `studies/<app>/`: the study, its tasks (goal, deterministic success check, expert baseline) and, for fixtures, the planted `known-issues.json`. Runs land in `studies/<app>/runs/<run>/sessions/<session>/` with `trace.json`, step frames, the persona's perceived frames, the Playwright trace and, once watched, the voice and MP4.
- `fixtures/acme`: a small admin app with six planted usability problems, used as the first calibration target.
- `src/runner`: the persona loop (perceive, transform, think and speak, act, record), perception transforms, mood, actions.
- `src/analyst.ts`, `src/judge.ts`, `src/monitor.ts`, `src/report.ts`: analysis, evaluation and signals.
- `src/replay`: timeline (pure function of time), browser player, voice, MP4 export.
- `src/server`: the dashboard.

## Adding your own app

```sh
npx tsx src/cli.ts init myapp --url http://localhost:3000
```

It asks for a name, an optional launch command, which personas to use, and a first task (goal, start path, success check), then writes `studies/myapp/` with a README on writing tasks. Pass flags to skip the questions. A task's `success` is a JS expression, URL path prefix, or text that must appear on the page.

Two optional study fields cover apps that need more than a URL:

- `setup`: a module in the study directory whose default export gets `{ context, study, task, persona }` for each fresh browser context, before the page opens. Use it to sign in (add an init script that plants a session), fake writes with `context.route`, or turn on an accessibility tree.
- `ready`: a JS expression to wait for after the start page loads, for apps whose first frame comes well after `networkidle` (Flutter: `window.__rmReady === true` or similar).

Hash routes (`#/teacher/students`) count as the path for URL success checks, wrong turns and baselines.

`studies/rocket` is a worked example against a Flutter web app on a hosted staging site: its `setup.mjs` signs in with a password grant, turns on Flutter semantics, and answers every write with a fake recorded on `window.__usabWrites`, which the tasks' success checks read.

Known limits on real apps: without a `setup`, sessions start with no credentials, and the screen-reader persona needs a DOM accessibility tree (Flutter needs semantics enabled).
