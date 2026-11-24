# AI Movement Coach for Physical Therapy: Specification

Status: draft v0.3 (pilot). Decisions agreed in planning and in the open-decisions review are recorded in [Decided](#decided); items still open are in [Still open](#still-open). How v1 is built is in [8. Technical design](#8-technical-design).

Reference proof-of-concept study: https://www.nature.com/articles/s41598-026-55431-x
A separate sample POC (https://ashehu.github.io/nabi-movement-coach/) was reviewed for behavioral ideas only. No design, UI or code from it is reused.

## 1. Goal

Build a browser app that gives a patient real-time feedback while they do physical therapy exercises on their own, by tracking their movement with an existing pose-estimation model and comparing it with therapist-defined targets.

This is a small feasibility pilot. It is **not** a clinically validated product, and no result from it may be presented as clinical evidence.

## 2. Target users

| User | Role in v1 |
|---|---|
| **Patient at home** (primary) | Does prescribed exercises alone in front of a webcam or phone camera and receives live feedback. |
| **Therapist** (secondary) | Sets per-exercise targets in a config file or simple settings form. Does not use a portal. Also assesses recorded sets for the evaluation. |
| **Research team** (evaluation) | Records consented test videos, labels them, runs the offline scoring script and writes the report. |

**Problem:** without supervision, patients cannot tell whether their form, range of motion, tempo, repetitions and holds are correct.

## 3. Main user flow

1. **Choose exercise:** the patient picks seated knee extension, sit-to-stand, or shoulder raise.
2. **Start camera:** the browser asks for camera permission; the pose model loads on-device.
3. **Framing check:** the app confirms the body parts required for that exercise are visible and lighting is adequate, and tells the patient how to fix it if not. The set cannot start until the check passes.
4. **Neutral calibration:** the patient holds a resting pose briefly so the app records their baseline posture.
5. **Countdown, then set:** the patient performs the prescribed set. The app shows a skeleton overlay, a live rep counter, a hold timer where relevant, and short text cues.
6. **Tracking loss:** if tracking becomes unreliable mid-set, the app pauses, shows a "can't see you well" state, gives no movement advice, and resumes only after tracking recovers.
7. **Summary:** at the end of the set the app shows reps completed, hold durations, best angle (or elevation), and a short list of what went well and what to adjust.
8. **Export (research use):** a timestamped JSON log of the session can be downloaded.

## 4. Requirements

### 4.1 Exercises

| ID | Exercise | Measures | Notes |
|---|---|---|---|
| R-EX1 | Seated knee extension | Knee angle, repetition count, hold duration | Side-view camera. One leg per set; the patient chooses the side. |
| R-EX2 | Sit-to-stand | Completed repetition count, movement tempo (e.g. rise and lower durations) | 45° front-side camera. Chair may partly occlude the legs. |
| R-EX3 | Shoulder raises | Arm elevation angle, sideways trunk lean | Front-facing camera. Optional in the original brief; included in v1 by decision. |

Build order: R-EX1, then R-EX2, then R-EX3. Each must work end to end before the next is started.

### 4.2 Functional requirements

- **R-F1 Pose tracking.** Run an existing pose-estimation model (MediaPipe pose landmarker) in the browser on live camera input. Start with the "full" variant and fall back to "lite" when the frame rate drops; log which variant was used. No custom model training.
- **R-F2 Metrics.** Compute joint angles, repetition counts, hold durations, tempo and trunk lean from landmarks.
- **R-F3 Therapist targets.** Read per-exercise targets from a JSON config: target angle, hold seconds, repetition count, tempo range, and tolerances. A simple in-app settings form edits the same values, and the form and the JSON file stay interchangeable (the form can load and export the JSON). Changing targets changes the feedback without code changes.
- **R-F4 Rule-based feedback.** Generate short text cues from rules comparing metrics with targets. Every cue carries a stable rule ID.
- **R-F5 Skeleton overlay and counters.** Show tracked landmarks over the video, a large repetition counter, and a hold timer.
- **R-F6 Framing check.** Per-exercise required-body-part and lighting checks before a set starts.
- **R-F7 Neutral calibration.** Capture a baseline posture before each set.
- **R-F8 Reliability gating.** When landmark confidence or visibility for required joints is below a threshold, suppress all movement advice and show the "tracking unreliable" state (see 4.3).
- **R-F9 Set summary.** Show a post-set summary as in step 7 of the flow.
- **R-F10 Session log.** Record per-frame timestamps, angles, movement state, tracking confidence, and the rule ID of any cue shown, and offer it as a JSON download. Include a field for an observer note.
- **R-F11 Latency measurement.** Log timestamps sufficient to compute the delay between a movement event and the feedback that responds to it.
- **R-F12 Disclaimer.** Show a persistent notice: experimental, not clinically validated, supports an existing care plan, does not diagnose or prescribe exercise.

### 4.3 Safety and reliability requirements

- **R-S1** The app must never display movement advice while tracking is unreliable.
- **R-S2** The app must not diagnose, prescribe, or suggest changes to the therapist's targets.
- **R-S3** Cues must be neutral and encouraging, not alarming, and must not tell the patient to push through pain.

### 4.4 Evaluation requirements

- **R-E1 Participants.** 2–3 consenting volunteers, several sets of each exercise. Reserve one volunteer for testing only if possible.
- **R-E2 Data separation.** Keep development recordings and final test recordings in separate sets. Do not tune thresholds on the test set.
- **R-E3 Angle accuracy.** Compare app joint angles with independent reference measurements taken with a goniometer or inclinometer at held poses (a few reference points per set, not every frame).
- **R-E9 Threshold discipline.** All rule thresholds (tracking confidence, hold tolerance, lean tolerance, tempo bounds, repetition definitions) live in the config, are tuned on development recordings only, and are frozen and versioned before the test set is scored.
- **R-E4 Count accuracy.** Compare repetition counts with manual counts.
- **R-E5 Feedback quality.** Compare the app's feedback with a physical therapist's assessment of the same sets; compute precision and recall per repetition. The therapist labels which issues (e.g. insufficient range, trunk lean, too fast) occurred in each repetition; a true positive is an app cue matching a therapist-labeled issue in that repetition.
- **R-E6 Robustness.** Test at least two lighting conditions and at least two camera positions.
- **R-E7 Failure reporting.** Report errors, incorrect feedback, and tracking failures, including those that did not meet the targets.
- **R-E8 Scoring tool.** An offline script computes angle error, count accuracy, feedback precision and recall, and feedback delay from labeled videos and session logs.

### 4.5 Prototype targets (project goals, not clinical standards)

| Metric | Target |
|---|---|
| Mean joint-angle error | 5° or less |
| Repetition counts exactly correct | at least 95% of test sets |
| Feedback precision | at least 90% |
| Feedback recall | at least 85% |

### 4.6 Deliverables

1. Working demo.
2. Source code.
3. Consented, labeled test videos.
4. A short evaluation report covering results, errors, and limitations.

## 5. Constraints

- **C-1 Platform:** browser web app (React + Vite, TypeScript) that runs on a laptop webcam or phone camera. No native app. The offline scoring script is written in Python.
- **C-2 Privacy:** pose estimation runs on-device. Live camera video is not uploaded. No accounts and no backend in v1.
- **C-3 Model:** use an existing pose-estimation model; no training or fine-tuning.
- **C-4 Consent and data handling:** recordings are made only with informed, documented consent. Stored videos and labels stay access-controlled and are shared only as the consent allows.
- **C-5 Scope of claims:** results demonstrate feasibility only. The report must state that the sample is small and not clinically valid.
- **C-6 Text feedback only:** no spoken cues in v1.
- **C-7 Single user, single session:** no multi-person tracking, no cross-session history.
- **C-8 Originality:** no design, UI or code is copied from the sample POC.

## 6. Out of scope for v1

- Patient or therapist accounts, a therapist portal, or any backend or database.
- Learning targets from a therapist's demonstration.
- Spoken or audio feedback.
- A full in-app recording, labeling, or reporting interface (only a minimal observer-note field in the export).
- Native iOS or Android apps.
- Multi-session history, progress charts, or reminders.
- Exercises other than the three listed.
- Any diagnosis, prescription, clinical claims, or regulatory submission.
- Multi-camera or depth-sensor setups.

## 7. Acceptance criteria

Each criterion is checked by observing the running app, the exported data, or the evaluation outputs. "Test set" means the held-out recordings from R-E2.

### Session flow and interface

1. Opening the app shows the three exercises (seated knee extension, sit-to-stand, shoulder raise), and selecting one leads to the camera permission request.
2. If camera permission is denied, the app shows a message that says access was denied and how to allow it, and no set can be started.
3. With the required body parts out of frame, the app shows a message naming what to fix, and the "start set" action is disabled. After the patient moves into a valid position, the message clears and the action is enabled.
4. After the framing check passes, the app shows a calibration prompt, then a visible countdown, then begins the set. A set cannot start before calibration completes.
5. During a set, the video shows a skeleton overlay on the patient and a repetition counter that increases by one each time a repetition is completed.
6. At the end of a set, a summary shows repetitions completed, best angle (or elevation), and at least one "went well" or "adjust" note.
7. A disclaimer stating the app is experimental and not clinically validated is visible on every screen from exercise selection through the summary.

### Exercise behavior

8. **Knee extension:** while the patient extends the knee, the displayed knee angle updates continuously. Holding the target angle for the configured number of seconds starts and counts down a hold timer, and the repetition counter increments when the hold completes.
9. **Knee extension:** extending the knee less than the configured target produces a cue with a rule ID indicating insufficient range, and no such cue appears when the target is reached.
10. **Sit-to-stand:** each full sit, stand, and sit-down cycle increments the repetition counter by exactly one; a partial rise that does not reach standing does not increment it.
11. **Sit-to-stand:** the summary reports a tempo value for the set (e.g. average rise and lower time), and a cue appears when tempo is outside the configured range.
12. **Shoulder raise:** the displayed arm elevation angle updates continuously, and raising the arm to the configured target counts one repetition.
13. **Shoulder raise:** leaning the trunk sideways beyond the configured tolerance produces a lean cue with a rule ID, and no lean cue appears when the trunk stays within tolerance.

### Therapist targets

14. Changing the target angle, hold seconds, repetition count, or tempo range, either by editing the JSON config and reloading or by editing the values in the settings form, changes the corresponding behavior (counter total, hold duration, or when cues fire) without any code change. A config exported from the form loads back into the app with the same values.
15. If the config file is missing or invalid, or the form holds an out-of-range value, the app shows a clear error naming the problem and does not start a set with guessed values.

### Reliability gating

16. Covering the camera, or moving a required joint out of view during a set, causes the app within 1 second to pause the set and show a "can't see you well" message, and no movement cue is displayed while the message is shown.
17. When the required joints become visible again, the app prompts the patient to resume, and the set continues or restarts as designed, without counting repetitions made while tracking was lost.
18. In every exported session log, no entry with tracking marked unreliable has a movement-advice rule ID attached.
19. In a deliberately dim or low-contrast setup, the framing check either passes with confident tracking or shows a lighting message; it never starts a set with unreliable tracking.

### Logging and export

20. Downloading the session log produces a JSON file containing, for each frame, a timestamp, the computed angle(s), the movement state, tracking confidence, and the rule ID of any cue shown, plus an observer-note field.
21. From a session log, a feedback delay can be computed for every cue shown. The evaluation report states the median and worst-case delay, and whether the median is at or under 300 ms.

### Evaluation

22. At least 2 volunteers, each with documented consent, have recorded several sets of each of the three exercises. Development and test recordings are stored separately, and at least one volunteer appears only in the test set unless the report records why that was not possible.
23. For every test video, a labeled file exists with the manual repetition count, reference angle measurements (method stated in the report), and the physical therapist's feedback assessment.
24. Running the offline scoring script on the test set produces a table of mean angle error, the share of sets with an exact repetition count, feedback precision, and feedback recall, for each exercise.
25. The report states, for each of the four prototype targets in 4.5, whether it was met on the test set, and gives the numbers whether or not it was met.
26. The report includes results for at least two lighting conditions and at least two camera positions, and lists every incorrect-feedback case and tracking failure found in the test set.
27. The report includes a limitations section stating that the sample is small, that this is a feasibility pilot, and that the results are not clinically valid.

### Deliverables

28. A reviewer can follow the README to run the demo locally in a browser and complete one set of each exercise.
29. The repository contains the source code, the offline scoring script with usage instructions, the therapist config files, and the evaluation report. The labeled test videos are provided or referenced in a way that matches the consent terms.

## 8. Technical design

This section records how v1 is built. It was reviewed against sections 3–7, and the changes from that review are folded in. Values described as config are tuned during the build (O-7), not fixed here.

### 8.1 Stack

| Concern | Choice | Notes |
|---|---|---|
| App | React 19 + Vite + TypeScript (strict), npm, Node ≥ 22 LTS | Confirm exact versions at scaffold time. |
| Pose | `@mediapipe/tasks-vision` PoseLandmarker, `full` and `lite` variants, `VIDEO` running mode | Gives 33 image and 33 world landmarks. |
| Model and wasm | Self-hosted under `public/`. A `predev`/`prebuild` script downloads the models and checks pinned sha256 sums, and copies the wasm from the npm package. Every asset URL uses `import.meta.env.BASE_URL`. | No third-party requests at runtime (C-2). A clean clone runs with `npm ci && npm run dev` (AC 28). Works from any static host or subpath (O-12). |
| Config validation | zod is the single source of truth for the config schema, the settings-form metadata (min, max, unit) and the generated log JSON Schema | |
| UI state | A `useReducer` phase machine, plus a small external store (`useSyncExternalStore`) for live values | Per-frame work stays out of React renders. |
| Styling | CSS modules, no UI kit | C-8. |
| Tests | Vitest and React Testing Library. Playwright with a fake camera for one smoke test and the permission-denied path | The full end-to-end suite is deferred to M5. |
| Scoring script | Python ≥ 3.11, standard library plus `jsonschema` and `pytest` | |
| CI | GitHub Actions: typecheck, lint, Vitest, build, Playwright smoke, pytest, and a check that nothing under `data/` is tracked | |
| Phone testing | A `dev:https` script with a self-signed certificate | Browsers only allow camera access in a secure context. |

Not used in v1: a backend, a database, a router, a state library. Inference runs on the main thread behind an async interface (8.2), so it can move to a worker if M5 shows that is needed.

### 8.2 Architecture principles

1. **Pure core, thin browser edges.** `src/core/` imports no DOM, React or MediaPipe code. It takes pose frames and the config and returns state, events and cues. R-F2, R-F4, R-F6 to R-F9 and R-S1 are implemented there and unit-tested without a browser.
2. **Clock-free core.** The core gets time only from each frame's timestamp `t`. A watchdog in the browser adapter injects a "no frame" tick when frames stop arriving (camera stall, background tab, muted track, orientation change), so the reliability gate still runs.
3. **One `FrameSource` interface** with two implementations: `CameraSource` (live) and `TraceSource` (a recorded pose trace, 8.5). Tests, the demo replay and offline evaluation all run the same pipeline on traces.
4. **`PoseEngine.detect` is async from day one**, so moving inference to a worker is a swap, not a rewrite.
5. **One choke point for cues.** Every cue goes through `CueGate`. Nothing else writes to the cue display or the log's `cue` field.
6. **Per-frame loop outside React.** Only discrete events (rep counted, cue changed, phase changed) and a throttled live readout touch React state.
7. **Unmirrored data, mirrored display.** Landmarks and logs keep the camera's real orientation. The preview mirrors the video and the overlay together with CSS, which avoids left/right mistakes when the patient chooses a side.
8. **Every threshold is config** (R-E9), including smoothing, cue dwell and display times, and calibration settings.

### 8.3 Reliability gating (R-F8, R-S1)

Gating has two layers.

- **Per-frame gate, fail closed.** A frame is unreliable if no pose is detected, if any required joint scores below `tracking.minVisibility`, or if any required joint lies closer than `tracking.boundsMargin` to the frame edge. On a single unreliable frame:
  - the cue gate closes and any visible cue is cleared at once;
  - the exercise engine discards the attempt in progress, so no repetition can span missing frames;
  - the log row is written with `trackingOk: false` and no cue.
- **Debounced phase change.** If frames stay unreliable for `tracking.unreliableAfterMs` (target 500 ms or less), the app shows the "can't see you well" state, where only `status` messages appear. After `tracking.recoverAfterMs` of reliable frames it shows "Ready to continue — press Resume", then a short framing check and countdown. Completed repetitions are kept.
- **Scope.** The gate runs from the framing check through the end of the set. Losing tracking during calibration restarts calibration. Losing it during the countdown returns to the framing check.
- **Framing pass** needs reliable frames continuously for `framing.stableMs` (about 1 s) and an effective frame rate of at least `tracking.minFps`. For side-view exercises, the chosen side's joints must also be the more visible ones, because the model can swap the near and far legs. Mean brightness only chooses the message ("lighting looks dim"); it never lets a set start by itself (AC 19).

The signal this gate relies on is unproven. M0.5 tests it before any product code is written (8.8).

### 8.4 Project structure

```
src/
  app/        React shell: session/ (phase reducer, SetRunner, live store), screens/, components/
  core/       Pure logic: types, geometry, smoothing, reliability, framing, calibration,
              exercises/ (kneeExtension, sitToStand, shoulderRaise), rules/ (registry, cueGate),
              summary, config/ (schema, load, hash), log/ (schema, recorder, invariants, export), trace/
  pose/       Browser adapters: PoseEngine, camera, frameSource, brightness, watchdog
public/config/targets.json    Therapist config, fetched at runtime without caching
public/models/, public/wasm/  Fetched by script, not committed
scripts/                      fetch-models, extract (video to trace), replay (trace to session log, in Node)
fixtures/synthetic/           Generator, with a noise model from the M0.5 traces, and generated sequences
docs/                         definitions.md, recording-protocol.md, evaluation-report.md
eval/                         Python scoring script, validators, schemas, tests
data/                         Not committed: videos, traces, raw logs, consent records (C-4)
```

Traces of real people are committed only if the consent terms (O-5) allow publishing derived skeleton data. Otherwise they stay in `data/`.

### 8.5 Data formats

Three formats are long-lived: the session log, the pose trace and the targets config. Each carries a `schemaVersion`. An unknown version is rejected; the pilot has no migrations.

**Session log (R-F10, R-F11).** Shared with the scoring script.

```ts
interface SessionLog {
  schemaVersion: 1;
  app: { version: string; gitSha: string };
  config: { hash: string; value: TargetsConfig };   // the full effective config
  exercise: 'kneeExtension' | 'sitToStand' | 'shoulderRaise';
  side?: 'left' | 'right';                           // anatomical, not mirrored
  device: { userAgent: string; camera: { w: number; h: number; fps: number }; clock: 'captureTime' | 'callback' };
  model: { variant: 'full' | 'lite'; delegate: 'GPU' | 'CPU' };
  calibration: { t: number; baseline: Record<string, number> };
  frames: FrameRow[];
  events: LogEvent[];
  observerNote: string;
}
interface FrameRow {
  t: number;                                 // ms from session start, frame capture time
  angles: Record<string, number | null>;     // open-keyed, e.g. { kneeFlexion: 41.2 }
  state: string;                             // exercise engine state
  trackingOk: boolean;                       // per-frame gate result
  conf: number;                              // lowest score over required joints
  cue: string | null;                        // rule ID shown this frame
  rep: number;                               // repetitions counted so far
}
type LogEvent =
  | { type: 'phase'; t: number; phase: string }
  | { type: 'attempt'; t: number; index: number; counted: boolean; peak: number;
      holdMs?: number; riseMs?: number; lowerMs?: number; issues: string[] }
  | { type: 'cue'; ruleId: string; attemptIndex: number | null; onsetT: number; confirmT: number; shownAt: number }
  | { type: 'tracking_lost'; t: number; firstBadT: number }
  | { type: 'tracking_recovered'; t: number };
```

- An **attempt** is one movement cycle, whether or not it counts as a repetition. A knee extension that never reaches the target is an attempt with `counted: false` and an insufficient-range issue. Therapist labels and feedback scoring (O-8) use attempts.
- **Cue timing:** `onsetT` is the frame in which the rule's condition first became true, `confirmT` the frame in which its dwell time was met, and `shownAt` the next animation frame after the cue was committed. The report gives the delay from onset and from confirmation (AC 21).
- **Timestamps:** `t` uses the `requestVideoFrameCallback` `captureTime` where the browser provides it, and the callback time otherwise. `device.clock` records which.

**Pose trace.** One format for recorded landmark sequences, used by `TraceSource`, tests, fixtures and offline replay. It holds `schemaVersion`, the model variant and delegate, the video size and, per frame, `t` plus 33 image landmarks (x, y, z, visibility, presence) and 33 world landmarks (x, y, z), or null when no pose was found. It can be exported next to the session log for research use.

**Targets config (R-F3).**

```ts
interface TargetsConfig {
  schemaVersion: 1;
  configVersion: string;           // "0.x-dev" while tuning; "1.0.0-frozen" once locked (R-E9)
  tracking:    { minVisibility: number; boundsMargin: number; unreliableAfterMs: number; recoverAfterMs: number; minFps: number };
  framing:     { stableMs: number; minLuma: number };
  calibration: { durationMs: number; maxMotion: number };
  smoothing:   { kind: 'ema'; alpha: number };
  cues:        { displayMs: number; cooldownMs: number; dwellMs: Record<string, number> };   // dwell per rule ID
  countdownSeconds: number;
  exercises: {
    kneeExtension: { targetFlexionAtMostDeg: number; toleranceDeg: number; holdSeconds: number; reps: number;
                     startFlexionDeg: number; reversalDeg: number };
    sitToStand:    { reps: number; riseMs: [number, number]; lowerMs: [number, number]; standFrac: number; sitFrac: number };
    shoulderRaise: { targetElevationDeg: number; toleranceDeg: number; reps: number; leanToleranceDeg: number;
                     resetElevationDeg: number };
  };
}
```

- **Angle convention:** clinical goniometer convention. For the knee, 0° is fully straight, so less extension is a larger flexion number. For the shoulder, 0° is the arm at the side. Field names say which direction meets the target, and `docs/definitions.md` gives a worked example for each field.
- **Shared validation:** the schema carries min, max and unit for each field. The settings form renders from it, and the JSON loader checks the same ranges (AC 14, 15).
- **Form edits** last for the session only. Export and import carry them between sessions.

**Rule registry (R-F4).** Each rule is `{ ruleId, category, kind, text }`, for example `{ ruleId: 'KE-RANGE-LOW', category: 'insufficient_range', kind: 'advice' }`. `kind` is `advice`, `positive` or `status`. `category` is the vocabulary the therapist's labels use. Only `status` messages may show while tracking is unreliable. Feedback precision and recall (R-E5) count `advice` cues only.

**Evaluation labels (one file per video).** `{ videoId, subjectId (pseudonymous), consentId, split: 'dev' | 'test', exercise, side, lighting, cameraPosition, manualRepCount, referenceAngles: [{ tVideo, joint, deg, method }], therapistAttempts: [{ index, tStart, tEnd, issues: [category] }] }`, validated against `eval/labels.schema.json`.

### 8.6 Flow, phases and per-frame pipeline

Phases: `loading → select → permission → framing → calibration → countdown → active ⇄ trackingLost → summary`, plus a blocking config-error state. The disclaimer sits above every phase, including error states (AC 7).

| Flow step (§3) | Implementation | ACs |
|---|---|---|
| Load | Fetch `targets.json` without caching and validate it. On failure, show the field path at fault and offer no way to start. | 14, 15 |
| 1 Choose exercise | Exercise list. Side choice for knee extension and shoulder raise, with where to place the camera. | 1 |
| 2 Start camera | `getUserMedia`. Each error type maps to a message that says how to allow access. A loading state covers the model load. | 2 |
| 3 Framing check | Gate stable for `framing.stableMs`, frame-rate floor and side check (8.3). Names what to fix, e.g. "move back so your feet are visible". "Start set" begins calibration. | 3, 19 |
| 4 Calibration | Averages stable frames into a baseline: trunk tilt, seated shoulder height, and the knee resting angle (logged only). Restarts if tracking drops or the patient moves. | 4 |
| 5 Countdown and set | `SetRunner` runs the per-frame pipeline below. | 5, 8–13 |
| 6 Tracking loss | As in 8.3. | 16–18 |
| 7 Summary | Repetitions, hold durations or tempo, best angle, and at least one went-well or adjust note, including for a zero-repetition set. | 6, 11 |
| 8 Export | Session log download with an observer note; optional pose trace. | 20, 21 |

Per frame, `SetRunner` runs: frame source → `PoseEngine.detect` → smoothing → per-frame gate. A bad frame closes the cue gate, discards the current attempt and is logged. A good frame goes on through `Exercise.computeMetrics` → `Exercise.step` → rule evaluation → `CueGate` → live store → drawing. Every frame is then appended to the log.

A set ends when the configured repetition count is reached or the patient presses "End set".

### 8.7 Offline evaluation

Test recordings are scored by replaying them through the same core logic the app uses:

1. **`extract`** turns a video into a pose trace, using the same model file and `VIDEO` running mode as the app, with frame-accurate decoding (ffmpeg-decoded frames or desktop Chrome). Phone footage that the chosen decoder cannot read (for example HEVC `.mov` from an iPhone) is transcoded first.
2. **`replay`** runs the trace through the core in Node and writes a session log. It is deterministic: the same trace always produces a byte-identical log. `t` equals the video's media time, so logs line up with the therapist's timestamps.
3. **`score.py`** computes angle error, the share of sets with an exact count, per-attempt precision and recall, and delay statistics, per exercise (AC 24).

Feedback delay (AC 21) is measured in live sessions on the target devices, not in replay. The report states which numbers came from which path.

**Threshold freeze (R-E9).** At M7 the config is cut as `1.0.0-frozen`. Its hash and the git commit are written to a committed lock file, and the commit is tagged. `score.py --split test` refuses any log whose config hash or `app.gitSha` does not match the lock, so code changes after the freeze are caught as well as config changes.

### 8.8 Milestones

Each milestone ends with something that can be demonstrated. O-4 and O-5 gate M7 and M8 and take time, so they start on day one.

| # | Milestone | Exit |
|---|---|---|
| M0 | Scaffold: Vite, TypeScript, Vitest, ESLint and CI; model fetch script; disclaimer; zod config schema and default `targets.json`; config hashing; log and trace schemas v1; draft rule registry. `docs/definitions.md` v0: attempt and repetition, hold break, sit-to-stand cycle, angle conventions, latency, issue categories, and the O-8 matching rule. | `npm ci && npm run dev` shows the exercise list and disclaimer. CI passes. |
| M0.5 | Tracking-reliability spike (below). | Pass criteria met, or secondary signals chosen and measured again. |
| M1 | Seated knee extension end to end. Order: camera, `PoseEngine`, overlay and trace export; then core logic tested on synthetic and spike traces; then the app shell on `TraceSource`; then gating, latency timestamps and log export. Phone smoke test over `dev:https`. | A person completes a set on a laptop webcam and on a phone and gets a summary and a valid log. AC 1–9, 14 and 15 (JSON file), 16–18, 20. |
| M2 | Sit-to-stand: trunk-only required joints, normalized seated shoulder height, full-cycle counting, tempo and tempo cue. | AC 10, 11. M1 gating and log checks re-run. |
| M3 | Shoulder raise (lateral, one arm): elevation angle, repetition at target with a reset threshold, trunk lean relative to the baseline. | AC 12, 13. |
| M4 | Settings form generated from the schema metadata, with export, import and reset. | AC 14, 15 (form). |
| M5 | Hardening: automatic full-to-lite fallback (decided during framing, never mid-set); performance on a mid-range phone; dim-light and covered-camera runs on each device; cue-text check (R-S2, R-S3); README tested on a clean clone; remaining Playwright tests. | AC 16–19 on device; AC 28; minimum device spec recorded (O-6). |
| M6 | Evaluation tooling: `extract`, `replay`, `score.py`, `validate_dataset.py`, `validate_logs.py` and report tables, built on synthetic data first. | `pytest eval/` passes. A dry run produces the AC 24 table. |
| M7 | Development recordings, tuning on development data only, threshold freeze. Gated on O-4 and O-5. | Frozen config and lock committed. `score.py --split dev` runs. Test split untouched. |
| M8 | Test recordings, therapist labels, scoring and report. Gated on O-4 and O-5. | AC 22–27, 29. |

The exercise order in 4.1 still holds: each exercise works end to end before the next is started. The settings form comes after the three exercises because the config shape settles during them; until then, tuning is done by editing the JSON file.

**M0.5 tracking-reliability spike.** This tests the riskiest assumption in the design: that "no pose, a visibility threshold and an in-frame check on the required joints" reliably signals unreliable tracking. AC 16–19 and R-S1 depend on it.

- **Method:** a scratch page records landmark traces (no video) of a team member, on a laptop and a phone, with both model variants, in eight scenarios: normal knee extension; sitting still in good light; lower legs out of frame; camera covered mid-set; sitting still in dim light; sit-to-stand with the chair hiding the legs; side view with the legs overlapping; and a required joint moved out of view mid-set. It also records inference time, frame rate, whether timestamp metadata is available, and whether phone video decodes in the browsers used for replay.
- **Pass:** one setting catches at least 99% of bad frames, flags fewer than 2% of good frames, and detects every bad episode within 500 ms of its onset.
- **If it fails:** add secondary signals (bone-length stability, jitter, presence score) before writing the reliability module.
- **Other outcomes:** left/right swaps in side view make the framing side check mandatory. Dim-light jitter well above the good-light baseline means the framing check needs a jitter or brightness term.
- **Reuse:** the traces become the noise model for synthetic tests (jitter, dropouts, visibility dips, single-frame spikes).

### 8.9 Acceptance-criteria verification

**U** unit test, **C** component test with `TraceSource`, **E** Playwright, **S** script check, **M** manual, **D** document review.

| AC | How it is checked |
|---|---|
| 1 | C: three options; selecting one requests the camera. E: smoke test. |
| 2 | U/C: each camera error type shows a message and no start action. E: camera permission denied. M: Chrome and Safari prompts. |
| 3 | U: framing with missing joints. C: trace switching from bad to good frames. M. |
| 4 | U: the phase reducer rejects illegal transitions. C: full phase walk. |
| 5 | C: overlay drawing and counter per repetition. E: canvas not blank. M: overlay alignment and mirroring. |
| 6 | U: summary, including zero repetitions. C. |
| 7 | C: disclaimer present in every phase, including error states. |
| 8 | U: hold completes, hold breaks, target never reached. M. |
| 9 | U: below target, and at target ± tolerance. |
| 10 | U: full cycle, partial rise, double bounce; spike traces. M. |
| 11 | U: fast, slow and in-range tempo. C: tempo in the summary. |
| 12 | U: reset threshold behavior. |
| 13 | U: lean relative to a baseline that is already tilted. |
| 14 | U: one trace under two configs gives different counts, hold length and cue timing. U: form → JSON → load round trip. M: edit `targets.json` and reload under `dev` and `preview`. |
| 15 | U: missing file, malformed JSON, wrong type, out-of-range value, unknown `schemaVersion`. C: the error names the field and no set can start. |
| 16 | U: phase change within `unreliableAfterMs`. U: randomized test that no cue appears on any frame whose gate failed, including during the debounce. U: watchdog with no frames. M: cover the camera. S: `tracking_lost.t − firstBadT` from logs. |
| 17 | U: dropout mid-hold and mid-rise discards the attempt. C: Resume flow. M. |
| 18 | U: log invariants on fixture sessions. S: `validate_logs.py` on every real log. |
| 19 | U: framing never passes without `stableMs` of reliable frames. M: dim room on each target device. |
| 20 | U: logs validate against the schema. E: download and validate. |
| 21 | U: pytest on logs with known delays. M: live sessions on target devices. |
| 22 | S: `validate_dataset.py` checks consent IDs, separate splits, and a test-only volunteer or a recorded reason. D: consent records. |
| 23 | S: every test video has a label file that validates against `labels.schema.json`. |
| 24 | U: pytest on a dataset with known answers. S: real test set. |
| 25 | S: the report generator emits the target table. D. |
| 26 | S: lighting and camera-position coverage; the report lists every false positive, false negative and tracking loss. D. |
| 27 | D: report headings, also checked in CI. |
| 28 | M: walkthrough on a clean machine. CI: `npm ci`, build and preview. |
| 29 | D: repository checklist. |

Requirements without a numbered criterion: R-S1 (randomized gate test, AC 16 and 18); R-S2 and R-S3 (automated check of cue text for banned words, then a therapist read-through of every cue); R-F1 fallback (policy test with injected frame rates, plus a manual run on a slow device); R-E2 and R-E9 (freeze lock, 8.7).

### 8.10 Decisions that are expensive to change

| Decision | What depends on it | Settle by |
|---|---|---|
| Session log schema | Scoring script, every recorded session | End of M1; no breaking changes after M7 starts |
| Pose trace format | Fixtures, replay, spike traces | M0 (drafted from M0.5) |
| Attempt and repetition definitions, hold break, sit-to-stand cycle | Manual counts, labels, scoring | `docs/definitions.md`, before M7 |
| Rule IDs and issue categories | Therapist labels, precision and recall | Before M7 |
| Angle conventions and config field names | Config, form, logs, goniometer comparison | M0 |
| Primary angle per exercise (image-plane 2D or world 3D) | Exercise engines | First choice from M0.5 and live testing; development data only confirms or changes it |
| Latency definition (onset, confirmation, shown) | AC 21, report | M0 |
| Pure clock-free core, async `PoseEngine`, `FrameSource` boundary | Testability, performance | M0 |
| Config shape and versioning | JSON file, form, logs | M0 (values stay tunable) |
| Freeze lock (config hash plus git commit) | Credibility of the test results | M7; it cannot be added credibly after test data has been seen |
| Self-hosted assets and `BASE_URL` | Hosting (O-12) | M0 |
| Minimum supported browsers and phones | README, model variant and delegate choice | After the M1 phone test and M5 |
| Recording protocol: camera positions, lighting, naming, file formats | All recordings | Before the first development recording |
| Consent wording, including derived skeleton data | What can be published (AC 29) | With O-5 |

### 8.11 Working assumptions

These fill gaps in sections 3–7. Confirm them with the therapist once one is recruited (O-4).

- Shoulder raise is lateral (abduction), one arm per set, with the side chosen by the patient. A front-facing camera cannot measure forward elevation.
- A broken knee hold resets the hold timer. The attempt is logged as not counted, with a hold-break issue.
- "Best angle" is the peak extension for the knee (smallest flexion value) and the peak elevation for the shoulder.
- After tracking loss, the partial attempt is discarded and completed repetitions are kept.
- `advice` and `positive` cues are both suppressed while tracking is unreliable.

### 8.12 Deferred within v1

These are not needed for any acceptance criterion before the milestone shown:

- Settings form: M4.
- Full Playwright suite and automatic model fallback: M5.
- Report template and freeze lock: M7.
- Contrast measure: dropped; mean brightness only.
- World-landmark angles: only for exercises where M0.5 shows image-plane angles fail.
- One-Euro smoothing filter: an exponential moving average unless development data needs more.

## Decided

| ID | Decision | Outcome |
|---|---|---|
| O-1 | Camera position per exercise | Side view for knee extension, 45° front-side for sit-to-stand, front for shoulder raises. The robustness test adds at least one alternate position per exercise. |
| O-2 | Feedback latency target | Median 300 ms or less from movement to on-screen cue; worst case also reported. |
| O-3 | Independent angle reference | Goniometer or inclinometer readings at held poses. Who takes the measurements is still open (see O-4). |
| O-6 | Pose model variant | MediaPipe "full" by default, falling back to "lite" on slow devices, with the variant logged. Minimum device spec to be recorded after first device tests. |
| O-7 | Rule definitions and thresholds | Defaults live in the config, are tuned on development recordings only, then frozen and versioned before the test set is scored. The specific values are set during the build. |
| O-8 | Feedback scoring unit | Per repetition: the therapist labels issues in each repetition, and app cues are matched against those labels. |
| O-9 | Tech stack | React + Vite (TypeScript) web app; Python offline scoring script. Hosting is not chosen; any static host works since there is no backend. |
| O-10 | Target entry | JSON config plus a simple in-app settings form. |
| O-11 | Knee-extension set | One leg per set, side chosen by the patient. |

## Still open

| ID | Decision | Why it matters | Gate |
|---|---|---|---|
| O-4 | **Volunteers and therapist:** 2–3 volunteers (one test-only) and one physical therapist are not yet recruited. Also: who takes the goniometer readings, and whether the therapist authors the targets. | Required for acceptance criteria 22 and 23. | No recording until settled. |
| O-5 | **Consent and ethics route:** not started. Institutional IRB or equivalent, consent form wording, video retention, and sharing terms. The wording must also cover derived skeleton data (landmark traces), and whether team members recording themselves for the M0.5 spike counts as recording. | Gates any recording of people and any release of the videos or traces (8.4). | Hard gate: no recording of volunteers until settled. |
| O-12 | **Hosting for the demo** (e.g. a static host) and the minimum supported phone and browser. | Affects how reviewers run the demo (criterion 28). | Before the demo is shared. |
