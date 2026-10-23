# Usabilify

Synthetic usability testing. Realistic personas use your web app with real goals while thinking aloud. Each session is recorded as a structured trace. You review the failures in a dashboard and watch a narrated replay rendered afterwards, in the persona's own voice, with what they saw beside what was on screen.

See [plan.md](plan.md) for the design and its review.

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

## Layout

- `personas/<id>/persona.json` and `voice.md`: who each persona is, how it perceives and acts, its patience and its voice.
- `studies/<app>/`: the study, its tasks (goal, deterministic success check, expert baseline) and, for fixtures, the planted `known-issues.json`. Runs land in `studies/<app>/runs/<run>/sessions/<session>/` with `trace.json`, step frames, the persona's perceived frames, the Playwright trace and, once watched, the voice and MP4.
- `fixtures/acme`: a small admin app with six planted usability problems, used as the first calibration target.
- `src/runner`: the persona loop (perceive, transform, think and speak, act, record), perception transforms, mood, actions.
- `src/analyst.ts`, `src/judge.ts`, `src/monitor.ts`, `src/report.ts`: analysis, evaluation and signals.
- `src/replay`: timeline (pure function of time), browser player, voice, MP4 export.
- `src/server`: the dashboard.

## Adding your own app

Create `studies/<app>/study.json` with `baseUrl` (and an optional `launch` command), add tasks under `studies/<app>/tasks/`, and pick personas. A task's `success` is a JS expression, URL prefix, or text that must appear.
