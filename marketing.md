# Marketing Usabilify

How the "synthetic user" market talks about itself, where it's exposed, and how we pitch Usabilify as the platform whose simulated people come closest to real ones.

Research done 23 October 2026. Vendor claims below are quoted as marketing, not as verified facts. Sources are at the end.

---

## 1. The landscape: five camps

### Synthetic respondents (interviews and surveys)
Synthetic Users, Articos, Delve AI, Minds, Yabble, Ditto, Simile, Listen Labs.

Personas answer questions. Nothing drives a product. This is the biggest and loudest camp.

- Synthetic Users: "User research at the speed of AI." "We synthesize brains so you can predict buyers, CFOs, doctors…" "We obsess over synthetic-organic parity" and claim "85–92%" parity. Positions as "a discovery co-pilot, not a replacement for real research." Sells on per-interview cost "versus $100+ with traditional research agencies."
- Delve AI: "$0.99 per synthetic user." Claims personas "replicate real user behaviors" and "mimic human behavior like no other", then hedges in the FAQ.
- Articos: sells itself as "the only tool with a peer-reviewed accuracy paper." $8–14.50 per study.
- Ditto: $50–75k/yr, Figma-native feedback from 300k pre-built personas.

### Population simulation and "digital twins"
Aaru, Artificial Societies, Brox, Evidenza, DoppelIQ.

Enterprise, forecasting, marketing messages. Brox: "Not personas. Not segments. Not statistical models." "Every answer comes with the receipts." "Stress-test the future before you ship the decision." Six-figure contracts, weeks of calibration. Not usability.

### AI testers that drive the product
Uxia, TheySaid, CanaryUsers, Delve (testing module), UX Materia, Erik Lieben's open `/tool-ux-study` skill.

This is our camp. Agents open a prototype or a live URL, attempt a task and think aloud.

- Uxia: "Validate your UX in minutes with AI testers." Testers "think and act like your real customers." "17x faster, 3x more actionable insights, 5x more affordable." "No recruiting, no no-shows, no bias." Publishes two "parity" case studies (GVB, K-Chess) with setup but no results on the public page. Gartner "Diamond startup to watch".
- TheySaid: "See how customers will react, right where you build." "Nothing ships on a guess." "Synthetic you can trust." From "$1 per synthetic test". Claims testers are trained on "100,000+ hours of real usability sessions" and that synthetic-only tests find "89% of issues versus 90% for human-only". Claims to be "the first and only company" whose synthetic testers record their screen while thinking aloud.
- CanaryUsers: "Find the bugs before your users do." "Canaries click like people, not scripts." "A flock on every pull request." $9–49/month. Developer-native, runs on deploy, outputs a fix list for Cursor or Claude Code.
- UX Materia: AI-simulated UX and accessibility audits with low-vision, color-blind and screen-reader personas. Audits screens; a "full audit in about 20 seconds". Doesn't appear to drive tasks.
- Lieben's skill: Playwright-driven AI testers with newcomer, power-user, mobile, blind, keyboard-only and low-vision personas. Open, developer-run. His framing is the one we want: "Automated tests check that the code works. This approach checks whether people can use it."

### AI QA agents
Momentic, QA Wolf, Autosana, TestMu, Spur.

These are the tests. They market "flake-free", "sit in CI", "own critical user flows", "no generated code". None of them claims to be human-like, and none of them should. They are the thing that passes while users get stuck.

### Human testers with disabilities
Fable ("The #1 accessibility research platform, powered by people with disabilities"), UserTesting panels.

The ground truth we approximate. Fable's pitch against automation is exactly our pitch against QA agents: standards compliance "does not guarantee that people can complete tasks confidently."

### Academia
UXAgent (Northeastern and Amazon), UXCascade (ETH Zurich and Adobe, UIST 2026).

Both drive live sites with LLM agents and both are candid about the gap. UXCascade: "the browser agent consistently struggles with visual perception", agents show "significantly lower variability in clicks and elements explored" than humans, and giving up is a step cap "of 25 steps per agent to balance realism and cost." UXAgent's reviewers judged the simulated behaviour "not fully realistic."

## 2. What the marketing has in common

1. **Speed and cost lead.** "Minutes, not weeks." "$1 per test." "5x more affordable." Every landing page opens here.
2. **Realism is asserted, never shown.** "Think and act like your real customers." "Click like people, not scripts." "Reason the way a first-time user would." Nobody explains what stops the model from behaving like a model.
3. **Parity percentages without methodology.** 85–92%, 89% vs 90%, "over 95%", "80–95%". None of the public pages link the study, the sample, or the metric definition.
4. **The hedge.** "Co-pilot, not a replacement." "Hypotheses to test." Every vendor says it, usually in the FAQ, after the headline says the opposite.
5. **Accessibility is a persona label.** Where it appears at all, "blind user" means a prompt that says "you are blind", with the model still reading the DOM or a screenshot.
6. **Nobody sits in CI and asks a research question.** CanaryUsers is in CI and asks "where are the bugs?" Uxia asks a research question from a research UI. The square "runs like a test suite, measures whether people can use it" is empty.

## 3. Where the whole category is exposed

This is the public record a sceptical buyer has read. Our pitch has to survive it, and it mostly argues for us.

- **Shallow and sycophantic.** NN/g's reruns of three real studies found synthetic participants "too shallow to be useful", praising every concept. In one rerun real learners abandoned their courses while the AI learners reported finishing them. Kapania et al. (2025): researchers saw plausible narratives at first, then shallow answers over several turns.
- **The tally is against them.** MeasuringU's review of experiments: 9 encouraging findings, 14 discouraging. Zero encouraging on matched variance or qualitative depth.
- **Simulated users never walk away.** Chen (2026), "Simulated Customers Never Walk Away": real non-buyers say "not now" and stop; simulated non-buyers ask about price. Expressed resistance halved (25.1% to 13.5%). Telling the simulator it may leave cuts the bias fivefold but doesn't close the gap.
- **The simulator you pick moves the score.** "Lost in Simulation" (ACL 2026): agent success rates shifted up to 9 points depending on which model played the user, with calibration error of 15 and worse proxies for non-standard English speakers.
- **Averages hold, subgroups break.** Toplines within ~4 points; subgroup error 10–30 points. Models inflate gaps between segments and pick the wrong segment in 50–72% of cases.
- **Underestimates frustration and load.** A 2026 paired study of students and AI twins: 92% thematic overlap, but the twins "consistently underestimated cognitive load and emotional frustration."
- **Lived experience.** AbilityNet: "A robot does not gain the experience of blindness when visual input is removed." A simulated blind user may report success where real blind users lose trust.

Every one of these criticisms is a criticism of a *prompted* persona: a capable model told to act like someone. Nobody has published a critique of a persona that is *constrained* to perceive, act and tire like someone, because almost nobody has built one.

## 4. The gap we fill

Everyone says "like a real user." We are the ones who can show the mechanism and measure the distance.

| The category's weakness | What Usabilify does about it |
|---|---|
| Agents see the DOM or an annotated screenshot | A sighted persona only ever sees the frame after a published color-vision model (Machado 2009), blur and contrast loss. A blind persona sees nothing: it gets the screen reader's linear buffer, where an unlabeled `div` is plain text. |
| Agents click by selector, with "lower variability" than people | Each persona has a modality and a tap-error distribution. Keyboard-only can only press keys. A phone persona misses a 20px gear for real and has to notice. Nobody can click a hidden element. |
| Agents are told they're a novice but keep the model's knowledge | A novice is told, in plain words, which conventions it doesn't have, and every persona is told it doesn't know where things are in this app. |
| Agents never walk away; giving up is a step cap | Patience is a budget. Wrong turns, dead clicks and slow pages spend it; progress refunds a little. The persona sees its mood as words and quits when someone with that temperament would. |
| Agents read a toast the instant it appears | Reaction time by expertise: a novice looks back ~2s after acting. A 1.5s toast is confirmed for the test and missed by Walt. |
| "Completed" means the assertion passed | After success the persona gets one more look. "Completed without realising it" is an outcome. |
| Parity % with no method | Four instruments: rule checks, a realism-and-grounding judge, judge-versus-human agreement, and a blind real-versus-generated deck. The instruments ship today. The numbers come when real transcripts go in, and we say so. |
| Research UI, per-seat pricing, upload your prototype | A CLI and a dashboard. Runs on your machine against your preview deploy, on your Claude login. 21 sessions in ~3 minutes for about $1.80. |

Our structural advantages, beyond fidelity:

- **Developer-native.** Runs where tests run. Nobody else combines a CI form factor with a usability question.
- **Open mechanism.** A buyer can read how Dana's vision is simulated. No competitor lets you inspect the model of the person.
- **Local and cheap.** No panel, no platform fee, your own model credentials.
- **The replay.** Narrated, in the persona's voice, with what they saw beside what was on screen, opening at the moment it went wrong. TheySaid claims "first and only" for screen-recorded think-aloud; our replay shows the perceived frame, which they can't.

## 5. The pitch

### Positioning statement

For teams whose tests pass and whose users still get stuck, Usabilify is the human layer of the test suite: simulated people, built as close to real ones as possible, who try your app on every build and tell you where they fail. Unlike synthetic-user tools that prompt a model to act like a person, Usabilify constrains what each persona can see, do, know and endure, and measures how close it gets.

### Headline candidates

Keith's line: **"Create a swarm of AI beta testers for your app."**

Keep the beta-tester frame. It's the mental model developers already have: a person who uses the app before launch and reports what confused them, which is our question, not QA's. Three things to fix before it's the headline:

- **Swarm is CanaryUsers' brand** ("a flock of lifelike AI users", "Let the birds loose", Scout / Flock / Murmuration). It also reads as many copies of one agent. Our value is seven different kinds of people. Say *panel*.
- **Real beta testers are the users who don't get stuck.** Enthusiasts, early adopters, experts. Our thesis is Walt, Dana and Priya, the people you can never recruit for a beta. Qualify the word or it points at the wrong user.
- **It doesn't carry the fidelity claim.** Pair it with a line that does.

Variants that keep the idea:

1. **Your tests pass. Your users still get stuck.** / Usabilify gives you a panel of AI beta testers, each a different kind of person, who try your app on every build. *(landing page)*
2. **AI beta testers who get stuck like people do.** / Color blind. 71 and new to this. On a phone on a bus. Pick a panel, point it at a build. *(developer audience)*
3. **Beta test with the users you can never recruit.**
4. **A beta test for every build, with people who don't exist yet.**

Recommendation: 1 as headline plus subhead; 2 where a single line is needed. "Beta tester" replaces "AI tester" in the vocabulary below.

### One-liners (pick by audience)

- **Developers:** Your tests pass. Your users still get stuck.
- **Product and design:** As close to a real person as software gets, on every build.
- **Accessibility:** Not a prompt that says "you are blind." A persona that can't see.
- **Sceptics:** Every synthetic user claims to be realistic. Ours shows you how, and how close.
- **Category line:** Tests check that it works. Usabilify checks that people can use it.

### The axis we own: depth per person, not breadth of panel

The swarm and population camps compete on count. Delve sells hundreds of personas, Ditto 300,000, Artificial Societies 2.5 million profiles. Every published failure of synthetic users is a failure of a shallow persona: a paragraph of prompt in front of a capable model. We go the other way. Seven people built with care beat a thousand prompts.

Say the care as parts, not as a feeling. Dana is a color-vision matrix at a stated severity, a tap-error distribution, a patience budget with a cost per wrong turn, a reaction time, a list of conventions she doesn't know, and a voice checked against rules. Each part can be opened, and each part can be wrong in a way you can see. That is what "care" means here: a persona is a model of a person with inspectable parts.

Expect "only seven?" Answer: the layers are generic, the library grows, and you can draft a new person from one sentence and preview your app through their eyes before you run.

### Saying the craft without adjectives

"Sophisticated", "high-tech", "advanced" and "carefully crafted" are on every competitor's page and buyers discount them to zero. Show one concrete part where the adjective would go. Verbs of making (built, engineered, modelled, fitted, calibrated) beat adjectives of quality.

- Beta testers, engineered.
- Built one person at a time.
- Engineered to fail the way people do.
- Not a prompt. A model of a person.
- Each beta tester is a model of a person with parts you can open.
- Hand-built beta testers who can't see red, can't use a mouse, or won't wait.
- Seven beta testers. Thousands of decisions about each one.
- A beta tester with a color-vision model, a tap-error distribution, a reaction time and a patience budget. Not a paragraph of prompt.
- We don't tell the model to act color blind. We take the red away before it looks.
- Most tools ship a thousand personas. We spent that effort on seven.

For a "precision" register, borrow from instruments rather than software: calibrated, modelled, published color-vision model, measured against people. "Calibrated beta testers" says precision without claiming it.

Body paragraph:

> Every Usabilify beta tester is built, not prompted. Dana's screen passes through a published color-vision model before she sees it. Priya's taps land with thumb-sized error. Walt looks back at the screen two seconds after he acts, so the toast is gone. Each of them has a patience budget that wrong turns spend, and each gives up when a person like them would. Every one of those parts is a number you can read, with its source or its status beside it.

Avoid "high-tech" (dates the product) and "sophisticated" (what people write when they can't show the thing).

### The lab: show the artifacts, not the word

A lab produces spec sheets, calibration records, serial numbers, bench tests and QC. Usabilify already has all five. Show them and the reader supplies "lab".

| Lab artifact | What we already have | How to say it |
|---|---|---|
| Spec sheet | Every parameter in `persona.json`, with source and status in `docs/persona-model.md` | "Every beta tester ships with a spec sheet." |
| Serial number | The persona hash recorded on every session | "Dana, build 7f3a. Sessions keep the exact version that ran them." |
| Bench test | The demo app with six planted problems | "Bench-tested against known failures before it meets your app." |
| QC | Rules and judge on every session | "Never trusted until checked. Every run." |
| Looking through the instrument | Draft-from-a-sentence preview of your app through the persona's eyes | "See what Dana sees before she starts." |

Lines:
- Built in the lab. Tested on your app.
- Every beta tester ships with a spec sheet.
- Specified. Calibrated. Versioned. Checked on every run.
- Dana, build 7f3a. Deutan, severity 1.0. Tap error σ 3 px. Looks back after 1.2 s. Patience 7. Source and status beside every number.
- We build people the way a lab builds an instrument: specified, calibrated, and never trusted until checked.
- Name the dashboard's Personas page **The Lab**; each persona page is its card.

The trap: the lab is the method, never the person. No "lab-grown users", no "synthetic humans". That hands the reader AbilityNet's objection (a robot in a lab does not gain blindness). The lab builds and calibrates the model; Dana stays a person with a name, a job and five minutes before a meeting. Spec sheet in the margin, Dana in the paragraph.

Product move that makes it true: a spec card per persona in the dashboard with every parameter, a status badge (literature / estimate / fitted), the build hash, the last QC result and the perceived-view preview. Mostly data already stored. Every screenshot of that page then does the lab marketing on its own.

### Three messaging pillars

**1. Each persona is a piece of work.**
A persona is a perception transform, an input modality, a knowledge gap, a patience budget and a voice. Each layer exists because a test that skips it lets a failure through, and each is a number or a rule you can read, not a prompt you have to trust. Lead every explanation with "tests assume X, people do Y."

**2. Fidelity is measured.**
Rules, judge, human-label alignment, real-versus-generated. Say plainly that calibration on real data is the next milestone. In a market of unverifiable parity percentages, an honest "here is the instrument, here is what it hasn't measured yet" is a differentiator, not a weakness.

**3. It runs like a test.**
CLI, CI, preview deploys, cost cap, run-to-run comparison, alerts when a kind of user starts failing. Spend real-user sessions on what the simulation raises.

### Proof points to use now

- Dana's session: the setting changed, the test passed, she never knew. Lead with this everywhere.
- Demo run: 7 personas, 3 tasks, 21 sessions, ~3 minutes, ~$1.80, 5 of 6 planted problems found, plus three nobody planted, including a gear too small for a thumb and an unlabeled plus sign.
- The miss: the red-border error nobody triggered. Telling this story shows the tool reports honestly.
- Code-level specifics: Machado 2009 matrices, screen-reader buffer, tap-error sigma, reaction-time model. These are the "receipts" Brox promises and doesn't show.

### Objections and answers

| Objection | Answer |
|---|---|
| "Synthetic users are shallow and sycophantic." | True of prompted personas. Ours are constrained. A color-blind persona that confidently names red fails a rule check. A screen-reader persona that describes layout is flagged. The persona can't flatter you about a toggle it can't read. |
| "Simulated users never give up." | Ours have a patience budget and do. Give-up timing is one of the four things the judge scores. |
| "How close is it, really?" | Here are the four instruments. The rules and judge run on every session today. Human-label agreement and the real-versus-generated deck need real transcripts, which is why the first paying customers' sessions matter. |
| "This replaces disabled testers." | It doesn't, and we won't say it does. It runs between their sessions so they spend their time on identity verification and complaints, not on the toggle that should have had a label. (This is AbilityNet's own recommended layering.) |
| "We already have Playwright agents." | Good. They tell you it works. This tells you whether Walt can find it. Different question, same pipeline. |
| "Single runs disagree." | So do people. Run trials; the dashboard shows Wilson intervals, not one cell. |

### Real people's data: what we can say, and when

"Grounded in real people" is the strongest claim in this market and the least backed. TheySaid says "trained on 100,000+ hours of real usability sessions" with no receipts. We should be the vendor who says which number came from which data.

What the evidence supports:
- Models fitted to interviews and surveys reproduce **attitudes** well. Stanford's generative-agent work matched people's own survey answers at about 85% of their test-retest reliability.
- The same approach reproduces **behaviour** badly. Real learners quit, the twins finished. Real non-buyers walk away, the simulated ones ask about price. Prompt-based prediction of real shopping actions landed near 12% in one 2026 benchmark.
- We sell behaviour: where people get stuck and when they leave. The data that improves that is traces, not preferences.

The architecture already has the fitting points. Patience budget, wrong-turn cost, tap sigma, reaction time and knowledge gaps are numbers in `persona.json`, set by hand today. The roadmap, in the order we can say it:

1. **Now:** "Each parameter is explicit, and each is marked as literature, estimate or fitted." Done: [docs/persona-model.md](docs/persona-model.md). Today only the color-vision matrices are literature (Machado 2009); everything else is an honest estimate.
2. **Next:** "Fitted to real sessions." Give-up timing from where real novices abandon. Voice samples from real think-aloud excerpts (the voice file already has the placeholder). This is the same data the calibration instruments need, so one collection effort feeds both.
3. **Later:** "A decision policy adapted on real traces," per kind of user.

Rules for this claim:
- Say "calibrated on" or "fitted to" real sessions, never "a twin of" or "the preferences of" real people. Twin language implies data on identifiable individuals and invites the AbilityNet objection in its strongest form: a copy of a blind person built from their data, used instead of them.
- Any real sessions are consented and aggregated by kind of user, and framed as calibrating the model, not cloning the person.
- No "trained on real people" line until the data is in and the number is published with its method.

### What not to say

- No parity percentage until the alignment run has real labels behind it. Everyone else does this. It's the category's credibility problem.
- Never "replaces user research" or "replaces disabled testers."
- Don't lead with price. Price is table stakes in this market; fidelity is the claim nobody else can back.
- Don't call personas "digital twins" or say they carry "the preferences of actual people." That language belongs to the population-simulation camp and implies data about specific individuals we don't hold and shouldn't want to.
- Avoid "AI testers." It drops the human-fidelity idea. Say "AI beta testers" when you need the plain-language frame, "simulated people" or "personas" otherwise. Avoid "swarm" (CanaryUsers' flock metaphor, and it implies identical agents); say "panel".

### Category name

Candidates, in order of preference:

1. **Human-fidelity testing.** Names the claim and the measurement.
2. **The human layer** (of your test suite). Names where it sits.
3. **Simulated usability testing.** Honest, descriptive, academic flavour (UXAgent, UXCascade use "simulated").

Avoid "synthetic users" as our category label. We can rank for it, but it carries the baggage in section 3.

## 6. Who we talk to first

- **Engineering leads already running agentic QA** (Momentic, QA Wolf, CanaryUsers users). They have the pipeline and the "green but broken" scar tissue. Pitch: the human layer, same CI.
- **Accessibility leads under EAA pressure** who can't afford Fable cadence for every build. Pitch: run between real sessions; show what the flow feels like, not just the violations.
- **Design teams who've tried Uxia or Synthetic Users and found it flattering.** Pitch: constrained, not prompted; here's the mechanism.

## 7. Launch narrative (developer audience)

1. Post Dana's session as the hook. Short clip of the replay, perceived view beside real view, her voice.
2. The "tests assume X, people do Y" table.
3. "How we built a persona that can't see" as a technical deep dive: transforms, screen-reader buffer, misclick model, patience, reaction time. Developers trust mechanism over percentages.
4. The honest calibration post: what we measure, what's measured so far, and a call for real think-aloud transcripts for the Turing deck.
5. Open the repo or a free tier for the local CLI. CanaryUsers starts at $9/month and TheySaid at $1 a test; our price story is "your own model credentials, about $1.80 per full panel run."

## 8. Next evidence to get

In order of marketing value:

1. Real think-aloud transcripts into the real-versus-generated deck, and the first judge-versus-human alignment numbers. This turns pillar 2 from a promise into a proof.
2. One run on a real product with known, documented issues, not the planted fixture.
3. A side-by-side with a prompted persona (same model, no constraints) on the demo app, to show how many of the six problems the prompted version misses and how differently it talks.

---

## Sources

Competitors and vendors
- Synthetic Users: https://www.syntheticusers.com/ and https://syntheticusers.com/faqs
- Uxia: https://www.uxia.app/ and https://www.uxia.app/research
- TheySaid: https://www.theysaid.io/
- CanaryUsers: https://www.canaryusers.ai/
- Delve AI: https://www.delve.ai/blog/synthetic-user-testing
- Brox: https://brox.ai/
- UX Materia: https://www.uxmateria.com/
- Articos tool roundup: https://www.articos.com/blog/best-synthetic-user-tools
- Artificial Societies coverage: https://siliconangle.com/2025/07/30/ai-startup-artificial-societies-simulates-behavior-target-audiences-speed-market-research/
- Fable: https://makeitfable.com/
- Momentic vs QA Wolf: https://momentic.ai/comparison/momentic-vs-qa-wolf
- Erik Lieben, AI think-aloud testers: https://eriklieben.com/posts/agentic-dev-workflow-ux-testing/

Research and criticism
- UXAgent (Northeastern/Amazon): https://arxiv.org/pdf/2504.09407
- UXCascade (ETH/Adobe, UIST 2026): https://arxiv.org/html/2601.15777v1
- Lost in Simulation (ACL 2026): https://aclanthology.org/2026.acl-long.2192/
- Simulated Customers Never Walk Away (2026): https://arxiv.org/abs/2606.20708
- MeasuringU, review of experiments with synthetic users: https://measuringu.com/review-of-experiments-with-synthetic-users/
- When Can You Trust Your Synthetic Users (2026): https://arxiv.org/pdf/2609.13148
- ScreenAudit (CHI 2025): https://dl.acm.org/doi/10.1145/3706598.3713797
- AbilityNet, can AI replace disabled users: https://abilitynet.org.uk/news-blogs/can-ai-replace-disabled-users-accessibility-testing
- NN/g findings as reported: https://radar.zurb.com/article/nielsen-norman-synthetic-users-were-too-shallow-to-be-useful-against-three-real-studies and https://www.userbrain.com/blog/synthetic-users-experiment/
- Synthetic user bias summary: https://synthers.ai/blog/synthetic-user-bias/
- Ballpark glossary (sceptical definition): https://ballparkhq.com/research-glossary/synthetic-users
- Versive, AI research tools compared: https://getversive.com/help/best-ai-user-research-tools
