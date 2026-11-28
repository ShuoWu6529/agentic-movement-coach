# AI Movement Coach pilot: build plan

This is the approved technical plan for v1: architecture, milestone order, the checks for each milestone, and current status. `SPEC.md` holds the requirements and acceptance criteria (AC) and stays the source of truth. Where this plan and `SPEC.md` disagree, `SPEC.md` wins, and this plan is updated.

The plan was reviewed against SPEC sections 3–7 before scaffolding, and the changes from that review are included. Values described as config are tuned during the build (O-7), not fixed here. Sections 1–12 were SPEC §8.1–8.12 in SPEC v0.3, and keep the same numbers.

## Status (2026-11-27)

| Milestone | State | Evidence |
|---|---|---|
| M0 Scaffold and definitions | **Done** | PR #3 (scaffold) and PR #4 (review fixes) merged. CI is green on `main`. 29 Vitest tests. Headless Chromium shows the exercise list and disclaimer from `npm run dev` after a clean `npm ci` and from a production build served at a subpath. |
| M0.5 Tracking-reliability spike | **Done** (2026-11-27) | Passes on the laptop webcam with `full`, the only supported device (phones and `lite` dropped: SPEC C-1, R-F1). At the app's current gate setting (visibility 0.5, margin 0.02), over all eight scenarios: 100% of bad frames caught (457 / 457), 0.32% of good frames flagged (6 / 1,862), worst detection delay 0 ms. Thresholds 0.3–0.8 all pass, so no config change. Results, scoring rule changes, re-takes and limitations are in `docs/spike-notes.md`. One follow-up: dim light (S5) left the gate passing with 3.8× the jitter, so the framing check needs a brightness or jitter term (added to M5). Tool in `spike/` and takes in `data/spike-takes/`, neither committed. |
| M1 Seated knee extension | **Done** (2026-11-27) | Core (`src/core`: gate, framing with side check, calibration, knee engine, cue gate, `SetSession`, summary, log build and invariants), browser edges (`src/pose`: async `PoseEngine`, `CameraSource`, `TraceSource`, watchdog), app shell (phase reducer, `SetRunner`, screens, summary and export). 111 Vitest tests, including the randomized no-cue-on-unreliable-frame test, run on synthetic traces (`fixtures/synthetic/`). Audited against the 2026-11-27 SPEC (webcam only, `full` only): `fetch-models` fetches only `full` and removes any other model file, so builds no longer ship `lite`; `PoseEngine` and the frame sources are `full`-only; trace replay refuses `lite` traces, so the app never writes `'lite'` to a log; the camera-denied help gives desktop Chrome and Safari steps instead of iPhone steps. 3 Playwright tests (fake-camera smoke, permission denied, log download) pass on the production build and are in CI. The owner's manual checks passed on 2026-11-27 on a laptop webcam in desktop Chrome (`device.clock`: `captureTime`); see **M1 manual checks** below. |
| M2 Sit-to-stand | **Built; live re-check pending** (2026-11-28) | Core: `SetSession` now runs any `Exercise` (`src/core/exercises/exercise.ts`); knee extension is wrapped unchanged. Sit-to-stand engine with trunk-only required joints (both shoulders and hips), two-stage calibration (seated, then standing), full-cycle counting, rise and lower tempo with the four tempo cues and `STS-TEMPO-GOOD`, and a tempo summary. Config schema v2 adds `sitToStand.minStandRise`. App: sit-to-stand on the exercise list and in trace replay, its calibration and set screens, and its summary. 152 Vitest tests (38 new for M2), including the randomized no-cue-on-unreliable-frame test and log invariants re-run on synthetic sit-to-stand traces (`fixtures/synthetic/sitToStandTrace.ts`); 4 Playwright tests, one new (sit-to-stand log download). The owner's first manual set (2026-11-28) found a false repetition and six missed ones. Both were fixed the same day with the body-size guard (config schema v3), recalibration after Resume and calibration holds in either order; the set now replays to 5 of 5. A live set with the fixes is still to do (see **M2 manual checks**). |
| M3–M8 | Not started | |

### M1 manual checks (passed 2026-11-27)

Run by the owner with the live camera, not a trace replay: a laptop webcam in desktop Chrome, using `npm run dev` (and `npm run preview` for the config check). Safari was not tested.

- [x] **Laptop set (M1 exit).** Complete one full knee-extension set on a laptop webcam. You reach the summary, and the downloaded session log is valid JSON.
- [x] **Permission prompts (AC 2).** Allow, and separately deny, camera access. The app says access was denied and how to allow it, with no Start button. Passed in desktop Chrome; desktop Safari not tested.
- [x] **Overlay (AC 5).** The skeleton lines up with your body. The preview is mirrored like a mirror, and choosing the left leg tracks your actual left leg.
- [x] **Cover the camera mid-set (AC 16, 17).** Within about 1 second the cue clears and "Can't see you well" appears. Uncover it, press Resume, and check that completed reps were kept and no rep was counted while covered.
- [x] **Config reload (AC 14, 15).** Edit `public/config/targets.json` (for example `holdSeconds` or `reps`) and reload, under both `npm run dev` and `npm run preview` (after `npm run build`). The new value takes effect. Then break the file on purpose: the app shows the config error and offers no way to start.
- [x] **Clock per device.** `device.clock` from the session log:
  - Laptop webcam, desktop Chrome: `captureTime`. Feedback delay from this setup is measured from the camera's capture time.

Owner decisions recorded with M1:

- [x] The **Decisions made in M1** listed below are confirmed (2026-11-27).
- [x] SPEC O-5 records that team members may record themselves (2026-11-27).

**Settled before M2.** M0.5 passed on 2026-11-27 (`docs/spike-notes.md`), which also satisfies the M5 gate measurement and the M0.5 requirement before M7. Settled on 2026-11-24, updated 2026-11-27:

- M0.5 was deferred on 2026-11-24, resumed by the owner on 2026-11-27 with the spike tool rather than the app's trace export, and passed the same day.
- `lite` was dropped on 2026-11-27 (SPEC R-F1, O-6). The app runs `full` only, and a device too slow for it fails framing.
- Phones and tablets were dropped on 2026-11-27 (SPEC C-1). v1 runs on a laptop or desktop webcam, and `npm run dev:https` was removed.
- O-5: the owner confirmed that team members may record themselves, both for the spike and for the traces exported during M1–M5 manual checks. Volunteer recording is still gated. Recorded in SPEC O-5 on 2026-11-27.
- `spike/` stays local and is not committed. Its takes go in `data/spike-takes/`, outside the folder the spike's dev server serves, and stay out of git (`data/` is ignored and checked by `check:data`).

### M2 manual checks (first set 2026-11-28; a second set with the fixes is still to do)

Run with the live camera at the 45° front-side position (SPEC O-1), on the laptop webcam in desktop Chrome, using `npm run dev`. Team members may record themselves for these checks (SPEC O-5).

**First set, 2026-11-28.** The owner recorded one set and kept its pose trace (`data/m2-manual/`, not committed). The owner saw the app working. Replaying the trace through the core (a valid log, no invariant problems) found two counting failures, both confirmed by the owner:

1. **False repetition.** At about 1:07 the owner stood up quickly, then walked toward the laptop to cover the camera. The body grew in the picture, and the shoulders dropped 240 px within a frame while every joint was still visible, so it read as sitting down and counted.
2. **Six missed repetitions.** Covering the camera at about 2:06 tilted the laptop lid. Afterwards the whole body sat about 45 px lower in the picture at the same distance. Resume did not recalibrate, so the full stands peaked at 0.72–0.84 of standing and none counted.

Fixed on 2026-11-28 by owner decision (see **Decisions** below): the body-size guard, recalibration after Resume and calibration holds accepted in either order. Replaying the same trace with the fixes gives 5 of 5 repetitions with a valid log. That replay is not a live check, because the owner was following the old prompts.

- [ ] **Real sets (AC 10, M2 exit).** Complete at least two sit-to-stand sets with the fixes. Each full sit, stand and sit cycle adds exactly one to the counter. A deliberate half rise adds nothing. Walking up to the laptop while standing pauses the set instead of counting. *First set: failed on both counting points above; re-check pending.*
- [ ] **Tempo (AC 11).** Stand up quickly once and sit down slowly once. The matching tempo cue appears, and the summary shows the average rise and lower times against the configured ranges. *First set: the fast rise and fast lower cues fired (rise 0.6 s, lower 0.8 s); no slow sit-down was recorded.*
- [ ] **Calibration headroom.** With the camera too close, standing during calibration names a shoulder at the edge of the picture and calibration does not finish. Move the camera back and it completes. *Not shown by the trace.*
- [x] **Cover the camera (AC 16, 17).** "Can't see you well" appeared 303 and 304 ms after the first bad frame. Completed reps were kept, and the rise in progress at the second cover was discarded. *First set.* After Resume, sit-to-stand now also repeats both calibration holds.
- [ ] **Config reload (AC 14).** Change `sitToStand.reps` or `riseMs` in `public/config/targets.json` and reload; the new value takes effect. *Not shown by the trace.*
- [ ] **Session log.** The downloaded log is valid JSON, has `exercise: "sitToStand"` and no `side`. *First set: only the pose trace was downloaded; a log rebuilt from it by replay validates.*

**Decisions made in M2** (owner, 2026-11-27; each is recorded where it applies):

- **Standing calibration** (`docs/definitions.md`): sit-to-stand calibrates seated, then standing, because the seated pose alone gives no standing height. The standing hold also checks before the set that standing fits in the frame (M0.5 S6's only false alarms were shoulders at the top edge). A new config field, `sitToStand.minStandRise`, sets the minimum shoulder rise, in seated trunk lengths, for the standing hold. Config `schemaVersion` goes from 1 to 2.
- **Sit-to-stand summary** (AC 6): sit-to-stand measures no angle, so its summary shows tempo in place of "best angle": mean and per-repetition rise and lower times against the configured ranges.
- **Last repetition's advice cue** (`docs/definitions.md`): if an advice condition about the final attempt holds on the frame that completes the set, counting stops and the cue is shown for `cues.displayMs` before the summary. An unreliable frame ends the set at once. Knee behaviour is unchanged.
- **Body-size guard** (2026-11-28, from the first manual set): during the active set, a sit-to-stand frame whose shoulder width is more than `sitToStand.maxScaleChange` (default 0.3) from the calibrated width is unreliable, with gate reason `scale`. Config `schemaVersion` goes from 2 to 3 (`configVersion` 0.4-dev). Frames log `shoulderWidthPx`.
- **Recalibration after Resume** (2026-11-28, from the first manual set): for sit-to-stand, Resume runs the short framing check and then both calibration holds again before the countdown. A resumed set can be ended during that recalibration. Knee extension is unchanged.

Also in M2, not needing a decision:

- Sit-to-stand has no side and no framing side check (the side check is for side-view exercises, §3). Its logs omit `side`.
- Tempo cues fire when each part of the cycle completes: the rise cue on reaching `standFrac`, the lower cue when seated again. A partial rise has no tempo and no issue.
- When tracking fails during calibration, the calibration screen names the joint to fix, using the framing messages.
- The session log stays v2: its fields are unchanged, and it embeds the config with the config's own `schemaVersion`. The log schema validates the embedded config against the version it declares (v2, or v1 for logs recorded in M1), so the M1 manual-check log still validates and keeps its invariants. The app itself loads only config v2 (AC 15).
- **Cue cooldown** lowered from 3000 to 1000 ms (`configVersion` 0.3-dev). Each condition episode already commits once and advice is cleared when the next attempt starts, so the cooldown only damps repeats of one rule. At 3 s it skipped the tempo cue of fast sit-to-stand reps about 2.5 s apart (a scored false negative, and AC 11 says the cue appears); 1 s is below any plausible gap between two attempts' cues and still damps a hold break that flickers within one attempt. This is a build-time default chosen without recordings (O-7); M7 tunes it on development data.
- **SPEC §3 step 4** now says calibration is "seated and then standing" for sit-to-stand (owner approval, 2026-11-27).
- **Calibration hold order** (2026-11-28, found by replaying the first manual set with recalibration): the first stage accepted any still pose, so a patient standing still before sitting was recorded as "seated" and calibration could never finish. The two holds are now accepted in either order, and the lower one is seated.
- The log keeps the calibration the set started with. A recalibration after Resume shows as a `calibration` phase event; its baseline is not logged, and replaying the pose trace reproduces it. The log schema is unchanged.
- The app reducer now records whether the set has started, so only a started set reaches the summary (calibration may now go to summary, for a resumed set).

**Open points found in M2:**

1. `maxScaleChange` 0.3 is a default chosen from one manual set: normal standing was about 1.13× the seated shoulder width, and the walk to the laptop passed 1.3× as the patient reached standing. Tune it on development data (O-7). Turning to face the camera from the 45° position also widens the shoulders and may trip it.
2. A camera moved during the set without a pause (no tracking loss) is not detected. Only a size change is, and a tilt shifts the picture without changing size.
3. The post-fix behaviour has been checked by replaying a recording only. The live re-check is the first item in the M2 manual checks above.

**Versions recorded at scaffold:** Node 24.16 and npm 11.13 (CI uses Node 24), React 19.3, Vite 8.3, Vitest 5.1, zod 4.6, `@mediapipe/tasks-vision` 1.2.3. TypeScript is pinned to 6.0.x because typescript-eslint supports versions below 6.1 only. Added in M1: `@playwright/test` 1.65.1 (Chromium build 1255). The permission-denied test uses full Chromium in headless mode (`channel: 'chromium'`), because the headless shell answers every camera prompt with `NotSupportedError`.

**Decisions made in M1** (confirmed by the owner on 2026-11-27; each is recorded where it applies):

- **Session log v2** (§5): `attempt` events carry `tStart`, so scoring can align attempts by time overlap, and `device.clock` gains `'trace'` for sessions replayed from a pose trace. No v1 log was ever recorded.
- **Knee attempt end** (`docs/definitions.md`): the `reversalDeg` end applies only outside the target band. Otherwise a patient who over-reaches and settles back into the band would end the attempt mid-hold.
- **Watchdog stall threshold:** no frame for 2 × 1000 / `tracking.minFps` ms of wall time. It is derived from existing config, so the config shape is unchanged.
- **Knee cue conditions** (`docs/definitions.md`): `KE-RANGE-LOW` fires when an attempt ends short of the band; `KE-HOLD-BREAK` fires live when a hold breaks; `KE-HOLD-DONE` fires when a repetition counts.
- **In-app trace replay** (research): a pose trace file can be replayed through the set from the exercise screen, with Start and Resume pressed automatically. The Playwright log test uses it.
- **Primary knee angle:** image-plane (2D) for the side view; the world-landmark angle is logged as `kneeFlexion3d` for the M1–M3 comparison (§10).

**Open points found in M1:**

1. With the draft `cues.dwellMs['KE-RANGE-LOW']` of 300 ms, the delay from onset to display is at least 300 ms by construction, so the O-2 median target (300 ms or less) cannot be met for that cue. The dwell is a config value to tune on development data (O-7). The latency definition (from `onsetT`) is unchanged.
2. ~~SPEC R-E5 and O-8 said feedback is scored "per repetition".~~ Resolved on 2026-11-24: the owner approved per-attempt scoring, and SPEC R-E5 and O-8 now say per attempt.

**Open decisions carried from M0.** These need the owner's call. They are not yet reflected in the sections below.

1. ~~The clock-free core, async `PoseEngine` and `FrameSource` boundary did not exist after M0.~~ Built as the first step of M1.
2. Proposed plan edits from PR #3:
   - ~~In §1, record CI staging: Playwright from M1, pytest from M6.~~ Playwright is in CI from M1.
   - ~~Record the versions above.~~
   - In §5, add the `exercise` field that the rule registry already carries.
3. `docs/definitions.md` items marked **(confirm)** need therapist review (O-4). These include the attempt start and end thresholds, hold-break handling, and the alignment tolerance for scoring.
4. The pose trace rejects repeated frame timestamps (`t` must strictly increase). Revisit if replay needs repeats.

## 1. Stack

| Concern | Choice | Notes |
|---|---|---|
| App | React 19 + Vite + TypeScript (strict), npm, Node ≥ 22 LTS | Versions recorded in Status. |
| Pose | `@mediapipe/tasks-vision` PoseLandmarker, `full` variant only, `VIDEO` running mode | Gives 33 image and 33 world landmarks. The `lite` fallback was dropped on 2026-11-27 (SPEC R-F1, O-6). The log and trace schemas still accept `'lite'`, so their versions don't change; the app writes only `'full'`. |
| Model and wasm | Self-hosted under `public/`. A `predev`/`prebuild` script downloads the models and checks pinned sha256 sums, and copies the wasm from the npm package. Every asset URL uses `import.meta.env.BASE_URL`. | No third-party requests at runtime (C-2). A clean clone runs with `npm ci && npm run dev` (AC 28). Works from any static host or subpath (O-12). |
| Config validation | zod is the single source of truth for the config schema, the settings-form metadata (min, max, unit) and the generated log JSON Schema | |
| UI state | A `useReducer` phase machine, plus a small external store (`useSyncExternalStore`) for live values | Per-frame work stays out of React renders. |
| Styling | CSS modules, no UI kit | C-8. |
| Tests | Vitest and React Testing Library. Playwright with a fake camera for one smoke test and the permission-denied path | The full end-to-end suite is deferred to M5. |
| Scoring script | Python ≥ 3.11, standard library plus `jsonschema` and `pytest` | |
| CI | GitHub Actions: typecheck, lint, Vitest, build, Playwright smoke, pytest, and a check that nothing under `data/` is tracked | |

Not used in v1: a backend, a database, a router, a state library. Inference runs on the main thread behind an async interface (§2), so it can move to a worker if M5 shows that is needed.

## 2. Architecture principles

1. **Pure core, thin browser edges.** `src/core/` imports no DOM, React or MediaPipe code. It takes pose frames and the config and returns state, events and cues. R-F2, R-F4, R-F6 to R-F9 and R-S1 are implemented there and unit-tested without a browser.
2. **Clock-free core.** The core gets time only from each frame's timestamp `t`. A watchdog in the browser adapter injects a "no frame" tick when frames stop arriving (camera stall, background tab, muted track, orientation change), so the reliability gate still runs.
3. **One `FrameSource` interface** with two implementations: `CameraSource` (live) and `TraceSource` (a recorded pose trace, §5). Tests, the demo replay and offline evaluation all run the same pipeline on traces.
4. **`PoseEngine.detect` is async from day one**, so moving inference to a worker is a swap, not a rewrite.
5. **One choke point for cues.** Every cue goes through `CueGate`. Nothing else writes to the cue display or the log's `cue` field.
6. **Per-frame loop outside React.** Only discrete events (rep counted, cue changed, phase changed) and a throttled live readout touch React state.
7. **Unmirrored data, mirrored display.** Landmarks and logs keep the camera's real orientation. The preview mirrors the video and the overlay together with CSS, which avoids left/right mistakes when the patient chooses a side.
8. **Every threshold is config** (R-E9), including smoothing, cue dwell and display times, and calibration settings.

## 3. Reliability gating (R-F8, R-S1)

Gating has two layers.

- **Per-frame gate, fail closed.** A frame is unreliable if no pose is detected, if any required joint scores below `tracking.minVisibility`, or if any required joint lies closer than `tracking.boundsMargin` to the frame edge. On a single unreliable frame:
  - the cue gate closes and any visible cue is cleared at once;
  - the exercise engine discards the attempt in progress, so no repetition can span missing frames;
  - the log row is written with `trackingOk: false` and no cue.
- **Debounced phase change.** If frames stay unreliable for `tracking.unreliableAfterMs` (target 500 ms or less), the app shows the "can't see you well" state, where only `status` messages appear. After `tracking.recoverAfterMs` of reliable frames it shows "Ready to continue — press Resume", then a short framing check and countdown. Completed repetitions are kept.
- **Scope.** The gate runs from the framing check through the end of the set. Losing tracking during calibration restarts calibration. Losing it during the countdown returns to the framing check.
- **Framing pass** needs reliable frames continuously for `framing.stableMs` (about 1 s) and an effective frame rate of at least `tracking.minFps`. For side-view exercises, the chosen side's joints must also be the more visible ones, because the model can swap the near and far legs. Mean brightness only chooses the message ("lighting looks dim"); it never lets a set start by itself (AC 19).

M0.5 measured this signal on 2026-11-27 (`docs/spike-notes.md`). The gate above, at `minVisibility` 0.5 and `boundsMargin` 0.02, passed on the laptop webcam. It caught every bad frame within 0 ms and flagged 0.32% of good frames. Visibility alone was not enough: an off-frame knee kept visibility 0.80, and only the bounds check caught it. Dim light did not trip the gate, so framing gets a brightness or jitter term in M5. The framing side check stays mandatory.

## 4. Project structure

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
fixtures/synthetic/           Generator, with a noise model from real team-member traces (M1 onward), and generated sequences
docs/                         definitions.md, recording-protocol.md, evaluation-report.md
eval/                         Python scoring script, validators, schemas, tests
data/                         Not committed: videos, traces, raw logs, consent records (C-4)
spike/                        M0.5 throwaway tool, separate package.json, outside root lint and tests
```

Traces of real people are committed only if the consent terms (O-5) allow publishing derived skeleton data. Otherwise they stay in `data/`.

## 5. Data formats

Three formats are long-lived: the session log, the pose trace and the targets config. Each carries a `schemaVersion`. An unknown version is rejected; the pilot has no migrations. All three exist as zod schemas in `src/core/` since M0.

**Session log (R-F10, R-F11).** Shared with the scoring script.

```ts
interface SessionLog {
  schemaVersion: 2;                                  // v2 since M1: attempt tStart, clock 'trace'
  app: { version: string; gitSha: string };
  config: { hash: string; value: TargetsConfig };   // the full effective config, checked against its own schemaVersion (v1 or v2)
  exercise: 'kneeExtension' | 'sitToStand' | 'shoulderRaise';
  side?: 'left' | 'right';                           // anatomical, not mirrored
  device: { userAgent: string; camera: { w: number; h: number; fps: number }; clock: 'captureTime' | 'callback' | 'trace' };
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
  | { type: 'attempt'; t: number; tStart: number; index: number; counted: boolean; peak: number;
      holdMs?: number; riseMs?: number; lowerMs?: number; issues: string[] }
  | { type: 'cue'; ruleId: string; attemptIndex: number | null; onsetT: number; confirmT: number; shownAt: number }
  | { type: 'tracking_lost'; t: number; firstBadT: number }
  | { type: 'tracking_recovered'; t: number };
```

- An **attempt** is one movement cycle, whether or not it counts as a repetition. A knee extension that never reaches the target is an attempt with `counted: false` and an insufficient-range issue. Therapist labels and feedback scoring (O-8) use attempts.
- **Cue timing:** `onsetT` is the frame in which the rule's condition first became true, `confirmT` the frame in which its dwell time was met, and `shownAt` the next animation frame after the cue was committed. The report gives the delay from onset and from confirmation (AC 21).
- **Timestamps:** `t` uses the `requestVideoFrameCallback` `captureTime` where the browser provides it, and the callback time otherwise. `device.clock` records which, or `'trace'` for a session replayed from a pose trace.
- **Angles:** knee extension logs `kneeFlexion` (image-plane, primary) and `kneeFlexion3d` (world landmarks), both null on unreliable frames. Sit-to-stand logs `standProgress` (0 seated, 1 standing) and `shoulderY` (pixels) in the same open-keyed field, also null on unreliable frames; its calibration baseline holds `seatedShoulderY`, `standingShoulderY` and `trunkPx`.
- **Attempt `peak`:** the smallest knee flexion, or the highest sit-to-stand progress. Sit-to-stand attempts that count carry `riseMs` and `lowerMs`.

**Pose trace.** One format for recorded landmark sequences, used by `TraceSource`, tests, fixtures and offline replay. It holds `schemaVersion`, the model variant and delegate, the video size and, per frame, `t` plus 33 image landmarks (x, y, z, visibility, presence) and 33 world landmarks (x, y, z), or null when no pose was found. It can be exported next to the session log for research use.

**Targets config (R-F3).**

```ts
interface TargetsConfig {
  schemaVersion: 3;                // v2 (M2): sitToStand.minStandRise; v3 (M2 manual set): maxScaleChange
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
    sitToStand:    { reps: number; riseMs: [number, number]; lowerMs: [number, number]; standFrac: number; sitFrac: number;
                     minStandRise: number; maxScaleChange: number };
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

## 6. Flow, phases and per-frame pipeline

Phases: `loading → select → permission → framing → calibration → countdown → active ⇄ trackingLost → summary`, plus a blocking config-error state. The disclaimer sits above every phase, including error states (AC 7). M0 implements `loading → select` and the config-error state.

| Flow step (SPEC §3) | Implementation | ACs |
|---|---|---|
| Load | Fetch `targets.json` without caching and validate it. On failure, show the field path at fault and offer no way to start. | 14, 15 |
| 1 Choose exercise | Exercise list. Side choice for knee extension and shoulder raise, with where to place the camera. | 1 |
| 2 Start camera | `getUserMedia`. Each error type maps to a message that says how to allow access. A loading state covers the model load. | 2 |
| 3 Framing check | Gate stable for `framing.stableMs`, frame-rate floor and side check (§3). Names what to fix, e.g. "move back so your feet are visible". "Start set" begins calibration. | 3, 19 |
| 4 Calibration | Averages stable frames into a baseline: trunk tilt, seated shoulder height, and the knee resting angle (logged only). Sit-to-stand then asks the patient to stand still for a standing height (M2), and repeats both holds after Resume. Restarts if tracking drops or the patient moves. | 4 |
| 5 Countdown and set | `SetRunner` runs the per-frame pipeline below. | 5, 8–13 |
| 6 Tracking loss | As in §3. | 16–18 |
| 7 Summary | Repetitions, hold durations or tempo, best angle, and at least one went-well or adjust note, including for a zero-repetition set. | 6, 11 |
| 8 Export | Session log download with an observer note; optional pose trace. | 20, 21 |

Per frame, `SetRunner` runs: frame source → `PoseEngine.detect` → smoothing → per-frame gate. A bad frame closes the cue gate, discards the current attempt and is logged. A good frame goes on through `Exercise.computeMetrics` → `Exercise.step` → rule evaluation → `CueGate` → live store → drawing. Every frame is then appended to the log.

A set ends when the configured repetition count is reached or the patient presses "End set".

## 7. Offline evaluation

Test recordings are scored by replaying them through the same core logic the app uses:

1. **`extract`** turns a video into a pose trace, using the same model file and `VIDEO` running mode as the app, with frame-accurate decoding (ffmpeg-decoded frames or desktop Chrome). Phone footage that the chosen decoder cannot read (for example HEVC `.mov` from an iPhone) is transcoded first.
2. **`replay`** runs the trace through the core in Node and writes a session log. It is deterministic: the same trace always produces a byte-identical log. `t` equals the video's media time, so logs line up with the therapist's timestamps.
3. **`score.py`** computes angle error, the share of sets with an exact count, per-attempt precision and recall, and delay statistics, per exercise (AC 24).

Feedback delay (AC 21) is measured in live sessions on the target devices, not in replay. The report states which numbers came from which path.

**Threshold freeze (R-E9).** At M7 the config is cut as `1.0.0-frozen`. Its hash and the git commit are written to a committed lock file, and the commit is tagged. `score.py --split test` refuses any log whose config hash or `app.gitSha` does not match the lock, so code changes after the freeze are caught as well as config changes.

## 8. Milestones

Order: **M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8.** M0.5 was deferred after M0 and done after M1 (2026-11-27). Each milestone ends with something that can be demonstrated. O-4 and O-5 gate M7 and M8 and take time, so they start on day one. M6 can start once the log schema is stable at the end of M1.

The exercise order in SPEC 4.1 holds: each exercise works end to end before the next is started. The settings form comes after the three exercises because the config shape settles during them; until then, tuning is done by editing the JSON file.

Every milestone keeps CI green: `npm ci`, `check:data`, `typecheck`, `lint`, `test` and `build`. Playwright joins CI in M1, pytest in M6. The checks below come in addition.

### M0 — Scaffold and definitions (done)

**Scope:** Vite, TypeScript, Vitest, ESLint and CI; model fetch script; disclaimer; zod config schema and default `targets.json`; config hashing; log and trace schemas v1; draft rule registry. `docs/definitions.md` v0 covers attempt and repetition, hold break, sit-to-stand cycle, angle conventions, latency, issue categories, and the O-8 matching rule.

**Exit:** `npm ci && npm run dev` shows the exercise list and disclaimer. CI passes.

**Checks:**
- Component tests: the disclaimer is shown on every M0 screen (AC 7). A missing file, broken JSON, an HTML fallback page, an out-of-range value, a cross-field conflict or an unknown `schemaVersion` each shows a config error naming the field, and no exercise can start (AC 15).
- Unit tests: config schema ranges and cross-field rules, a stable canonical hash, log and trace schemas, rule registry consistency.
- ESLint enforces the purity of `src/core/`.
- Headless browser: the dev server after `npm ci`, and the production build served from a subpath.

### M0.5 — Tracking-reliability spike (done)

**Done on 2026-11-27:** passes on the laptop webcam with `full`. See `docs/spike-notes.md`. The deferral note below is kept as history.

**Deferred on 2026-11-24 (superseded: resumed and passed on 2026-11-27).** The owner can't record the takes now. The spike tooling stays in `spike/` (local, not committed), and the plan below is kept as the specification of the measurement. What moved where:

- **Gate measurement (Pass criteria below):** M5, on real traces exported by the app, recorded in the same eight scenarios on the laptop webcam with the `full` model. It must pass before M7 starts.
- **Framing side check:** mandatory from M1 rather than conditional on finding left/right swaps.
- **Dim-light jitter term:** decided from the M5 dim-room runs.
- **Timestamp metadata:** the `device.clock` fallback (§5) already covers browsers without `captureTime`. The value seen on each target device is recorded in M1.
- **Video decoding for replay:** checked in M6, where `extract` needs it.
- **Primary angle (2D or 3D):** chosen from M1–M3 live testing (§10).
- **Noise model for synthetic tests:** hand-written noise until real team-member traces exist.

**Scope:** test the riskiest assumption in the design: that "no pose, a visibility threshold and an in-frame check on the required joints" reliably signals unreliable tracking. AC 16–19 and R-S1 depend on it. A scratch page records landmark traces (no video) of a team member, on a laptop webcam with the `full` model (phones and `lite` were dropped on 2026-11-27, SPEC C-1 and R-F1), in eight scenarios:
- normal knee extension;
- sitting still in good light;
- lower legs out of frame;
- camera covered mid-set;
- sitting still in dim light;
- sit-to-stand with the chair hiding the legs;
- side view with the legs overlapping;
- a required joint moved out of view mid-set. Since 2026-11-27 this one is scripted: the image given to the model slides down so the legs leave the frame, because human BAD/GOOD timing was too coarse for the 500 ms criterion.

It also records inference time, frame rate, whether timestamp metadata is available, and which video formats decode in the browsers used for replay.

**Exit:** the pass criteria are met, or secondary signals are chosen and measured again. The results are written up in `docs/spike-notes.md`.

**Checks:**
- **Pass:** one gate setting catches at least 99% of bad frames, flags fewer than 2% of good frames, and detects every bad episode within 500 ms of its onset, on every device tested.
- **If it fails:** add secondary signals (bone-length stability, jitter, presence score) before writing the reliability module.
- **Left/right swaps** in the side-view scenario make the framing side check mandatory.
- **Dim-light jitter** well above the good-light baseline means the framing check needs a jitter or brightness term.
- **Analyzer correctness:** `npm test` in `spike/` checks the analyzer against synthetic takes with known answers.

**Reuse:** the traces become the noise model for synthetic tests (jitter, dropouts, visibility dips, single-frame spikes).

### M1 — Seated knee extension, end to end

**Scope, in order:**
1. Camera, `PoseEngine`, overlay and trace export.
2. Core logic, tested on synthetic traces (and real team-member traces once recorded).
3. The app shell on `TraceSource`.
4. Gating, latency timestamps and log export.


**Exit:** a person completes a set on a laptop webcam and gets a summary and a valid log. Covers AC 1–9, 14 and 15 for the JSON file, 16–18 and 20.

**Checks:**
- Unit tests:
  - phase reducer rejects illegal transitions (AC 4);
  - framing fails when the chosen side's joints are not the more visible ones (side check mandatory);
  - framing with missing joints (AC 3);
  - hold completes, hold breaks, target never reached (AC 8);
  - below target and at target ± tolerance (AC 9);
  - one trace under two configs gives different counts, hold lengths and cue timing (AC 14);
  - the phase change happens within `unreliableAfterMs` (AC 16);
  - a randomized test shows no cue on any frame whose gate failed, including during the debounce (AC 16, R-S1);
  - the watchdog fires when no frames arrive;
  - a dropout mid-hold discards the attempt (AC 17);
  - log invariants hold on fixture sessions (AC 18);
  - logs validate against the schema (AC 20).
- Component tests on `TraceSource`: a full phase walk; framing switches from bad to good frames; overlay drawing and the counter per repetition (AC 5); Resume flow (AC 17); summary including zero repetitions (AC 6); disclaimer in every phase (AC 7).
- Playwright: fake-camera smoke test with a non-blank canvas; camera permission denied shows a message and no start (AC 1, 2); log download validates (AC 20).
- Manual:
  - one real set on a laptop webcam;
  - Chrome and Safari permission prompts;
  - overlay alignment and mirroring;
  - cover the camera mid-set;
  - edit `targets.json` and reload under `dev` and `preview`.

### M2 — Sit-to-stand

**Scope:** trunk-only required joints, normalized seated shoulder height, full-cycle counting, tempo and tempo cue. Added in M2 by owner decision: a standing calibration hold, and a tempo summary in place of best angle (see Status).

**Exit:** AC 10 and 11. The M1 gating and log checks are re-run for this exercise.

**Checks:**
- Unit tests: full cycle, partial rise, double bounce, and real sit-to-stand traces when available (AC 10); fast, slow and in-range tempo (AC 11).
- Component test: tempo shown in the summary.
- The M1 gating, randomized-cue and log-invariant tests are re-run for sit-to-stand.
- Manual: real sets at the 45° front-side camera position.

### M3 — Shoulder raise (lateral, one arm)

**Scope:** elevation angle, repetition at target with a reset threshold, trunk lean relative to the baseline.

**Exit:** AC 12 and 13.

**Checks:**
- Unit tests: reset-threshold behavior so a hovering arm cannot double-count (AC 12); lean relative to a baseline that is already tilted, and no lean cue within tolerance (AC 13).
- The M1 gating and log checks are re-run for this exercise.
- Manual: real sets with a front camera.

### M4 — Settings form

**Scope:** a form generated from the schema metadata, with export, import and reset.

**Exit:** AC 14 and 15 for the form.

**Checks:**
- Unit test: a form → JSON → load round trip returns the same values (AC 14).
- Component tests: out-of-range and cross-field errors shown at the named field, with no way to start (AC 15). An edited value changes behavior on a trace (AC 14).

### M5 — Hardening

**Scope:**
- performance on a lower-end laptop;
- dim-light and covered-camera runs on each device;
- ~~the deferred M0.5 gate measurement~~: satisfied by M0.5 on 2026-11-27 (`docs/spike-notes.md`). Re-measure only if the gate logic, smoothing, model file or thresholds change;
- a framing term for dim light, from M0.5 S5. In a room at brightness 17 / 255 the gate passed every frame with 3.8× the good-light jitter, so framing must refuse to start there. Simplest: block on the existing `framing.minLuma`, a behaviour change with no config shape change. A jitter term needs a new config field and a `schemaVersion` bump. Tune on development data only;
- cue-text check (R-S2, R-S3);
- README tested on a clean clone;
- remaining Playwright tests.

**Exit:** AC 16–19 verified on device; the dim-light framing term in place, with a dim room refused at framing (AC 19); AC 28; minimum device spec recorded (O-6).

**Checks:**
- A device below `tracking.minFps` with `full` fails framing with the slow-device message and cannot start a set (R-F1, no fallback).
- Dim-light framing: a unit test that framing does not pass below the dim threshold even with reliable frames, and a manual dim-room run (AC 19). The M0.5 gate measurement itself is already done (2026-11-27).
- Automated cue-text check for banned words, then a therapist read-through of every cue.
- Manual on each target device: dim room (AC 19), covered camera and joint out of view (AC 16, 17), and median feedback delay measured from live logs.
- Clean-machine walkthrough of the README, one set per exercise (AC 28).

### M6 — Evaluation tooling

**Scope:** `extract`, `replay`, `score.py`, `validate_dataset.py`, `validate_logs.py` and report tables, built on synthetic data first.

**Exit:** `pytest eval/` passes. A dry run produces the AC 24 table.

**Checks:**
- pytest on logs with known delays (AC 21) and on a dataset with known answers (AC 24).
- `replay` run twice on one trace gives byte-identical logs.
- A live fake-camera run and a replay of the same clip match in repetition count, with angles within 1–2°.
- `score.py --split test` refuses a log whose config hash or git commit differs from the lock.
- `validate_logs.py` flags an advice rule ID on an unreliable frame (AC 18).

### M7 — Development recordings, tuning and freeze

Gated on O-4 and O-5. The M0.5 gate measurement it also required passed on 2026-11-27.

**Exit:** the frozen config and lock file are committed. `score.py --split dev` runs. The test split is untouched.

**Checks:**
- `validate_dataset.py` shows that the development and test sets are separate and every subject has a consent ID (AC 22).
- Thresholds are tuned on development data only.
- The lock file and tag match the frozen config.
- `docs/definitions.md` and the rule IDs are final before labeling starts.

### M8 — Test recordings, labels, scoring and report

Gated on O-4 and O-5.

**Exit:** AC 22–27 and 29.

**Checks:**
- `validate_dataset.py` (all of these, plus label-file validity):
  - a label file per test video (AC 23);
  - lighting and camera-position coverage (AC 26);
  - a test-only volunteer, or a recorded reason (AC 22).
- `score.py --split test` produces the per-exercise table (AC 24).
- Review of the report:
  - the target table (AC 25);
  - every failure listed (AC 26);
  - the limitations section (AC 27);
  - the repository checklist (AC 29).

## 9. Acceptance-criteria verification

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
| 10 | U: full cycle, partial rise, double bounce; real traces when available. M. |
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

Requirements without a numbered criterion:
- R-S1: randomized gate test, plus AC 16 and 18.
- R-S2 and R-S3: automated check of cue text for banned words, then a therapist read-through of every cue.
- R-F1: the variant and delegate are logged. With no fallback, a device below `tracking.minFps` fails framing (unit test of the slow-framing path, plus a manual run on a slow device).
- R-E2 and R-E9: freeze lock (§7).

## 10. Decisions that are expensive to change

| Decision | What depends on it | Settle by |
|---|---|---|
| Session log schema | Scoring script, every recorded session | End of M1 (v2); no breaking changes after M7 starts |
| Pose trace format | Fixtures, replay, spike traces | M0 (drafted from M0.5) |
| Attempt and repetition definitions, hold break, sit-to-stand cycle | Manual counts, labels, scoring | `docs/definitions.md`, before M7 |
| Rule IDs and issue categories | Therapist labels, precision and recall | Before M7 |
| Angle conventions and config field names | Config, form, logs, goniometer comparison | M0 |
| Primary angle per exercise (image-plane 2D or world 3D) | Exercise engines | First choice from M1–M3 live testing (M0.5 deferred); development data only confirms or changes it |
| Latency definition (onset, confirmation, shown) | AC 21, report | M0 |
| Pure clock-free core, async `PoseEngine`, `FrameSource` boundary | Testability, performance | Built in M1 |
| Config shape and versioning | JSON file, form, logs | M0 (values stay tunable) |
| Freeze lock (config hash plus git commit) | Credibility of the test results | M7; it cannot be added credibly after test data has been seen |
| Self-hosted assets and `BASE_URL` | Hosting (O-12) | M0 |
| Minimum supported computers and browsers | README, delegate choice (`full` only) | After the M1 laptop test and M5 |
| Recording protocol: camera positions, lighting, naming, file formats | All recordings | Before the first development recording |
| Consent wording, including derived skeleton data | What can be published (AC 29) | With O-5 |

## 11. Working assumptions

These fill gaps in SPEC sections 3–7. Confirm them with the therapist once one is recruited (O-4).

- Shoulder raise is lateral (abduction), one arm per set, with the side chosen by the patient. A front-facing camera cannot measure forward elevation.
- A broken knee hold resets the hold timer. The attempt is logged as not counted, with a hold-break issue.
- "Best angle" is the peak extension for the knee (smallest flexion value) and the peak elevation for the shoulder.
- After tracking loss, the partial attempt is discarded and completed repetitions are kept.
- `advice` and `positive` cues are both suppressed while tracking is unreliable.

## 12. Deferred within v1

These are not needed for any acceptance criterion before the milestone shown:

- Settings form: M4.
- Full Playwright suite: M5.
- Report template and freeze lock: M7.
- Contrast measure: dropped; mean brightness only.
- World-landmark angles: only for exercises where live testing shows image-plane angles fail.
- One-Euro smoothing filter: an exponential moving average unless development data needs more.
