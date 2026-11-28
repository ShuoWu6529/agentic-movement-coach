# Definitions (v1, draft)

Status: draft, v0 written in M0, extended in M1 (knee attempt end, attempt indices, tracking reliability, cue conditions) and M2 (sit-to-stand calibration, progress, tempo, cue conditions, the last repetition's cue; after the manual set: calibration hold order, recalibration on Resume, the body-size guard). These definitions decide what counts in manual counts, therapist labels and scoring, so they must be settled before M7 (PLANS.md §10). Items marked **(confirm)** are working assumptions (PLANS.md §11) to check with the therapist once one is recruited (O-4). Numbers in `code` are config fields in `public/config/targets.json`. Their values are tuned on development data only (R-E9).

## Angle conventions

Clinical goniometer convention. Angles are in degrees, measured in the camera's real (unmirrored) orientation.

| Angle | 0° means | Larger means | Target field |
|---|---|---|---|
| Knee flexion (`kneeFlexion`) | Knee fully straight | More bent | `kneeExtension.targetFlexionAtMostDeg`: the target is met when flexion is **at most** this |
| Shoulder elevation (`shoulderElevation`) | Arm hanging at the side | Arm raised further out to the side (abduction) | `shoulderRaise.targetElevationDeg`: met when elevation is **at least** this |
| Trunk lean (`trunkLean`) | Trunk at the calibrated baseline tilt | Leaning further sideways, either direction | `shoulderRaise.leanToleranceDeg`: a lean cue fires above this |

Worked examples:

- `targetFlexionAtMostDeg: 10`, `toleranceDeg: 5`. A patient whose knee reaches 14° of flexion meets the target (within 10 + 5). At 17° the attempt has an `insufficient_range` issue.
- `targetElevationDeg: 90`, `toleranceDeg: 10`. An arm that reaches 82° meets the target (within 90 − 10). At 75° it does not.
- `leanToleranceDeg: 10`. A patient who sits with 4° of tilt at calibration and leans to 15° during a raise has leaned 11° from baseline, which is beyond tolerance.

Which angle is used (image-plane 2D or world 3D) per exercise is chosen from live testing in M1–M3 (PLANS.md §10).

## Attempt and repetition

- An **attempt** is one movement cycle, whether or not it counts. Therapist labels and feedback scoring are per attempt (O-8).
- A **repetition** is an attempt that meets the exercise's completion rule below. Only repetitions increase the on-screen counter.
- An attempt in progress when tracking becomes unreliable is discarded: it is neither an attempt nor a repetition. Completed repetitions are kept (PLANS.md §3) **(confirm)**.

### Seated knee extension

- An attempt starts when flexion drops below `startFlexionDeg`. It ends when flexion returns above `startFlexionDeg`, or when flexion is outside the target band and has risen by `reversalDeg` from the best (smallest) value reached. The reversal end applies only outside the band, so a patient who straightens past the target and settles back inside the band keeps holding (M1: without this, with the default 10° target, 5° tolerance and 10° reversal, a knee that reaches 3° and settles at 13° would end its attempt mid-hold).
- It counts as a repetition when flexion stays within the target band (`targetFlexionAtMostDeg` + `toleranceDeg`) continuously for `holdSeconds`. The repetition counter increases at that moment, while the leg is still up (AC 8). The attempt is logged when it ends.
- **Hold break:** flexion leaves the target band before `holdSeconds` have passed. The hold timer resets. If the attempt then ends without a completed hold, it is logged as not counted with a `hold_break` issue **(confirm)**.
- An attempt that never reaches the target band has an `insufficient_range` issue.
- After an attempt ends by reversal, or after tracking loss, a new attempt can start only once flexion has returned above `startFlexionDeg`.

### Attempt indices and tracking loss

- Each attempt gets the next `index` when it starts. An attempt discarded because of tracking loss is not logged, so it leaves a gap in the indices. Scoring aligns app attempts with labeled attempts by time (`tStart`–`t` of the `attempt` event), not by index.
- If tracking is lost after an attempt's repetition was counted, the repetition is kept and the attempt is logged as counted, ending at the first unreliable frame. The same applies when the set ends mid-attempt.

### Sit-to-stand

- **Shoulder height** is the mean image y of the two shoulders, in pixels. Both shoulders are averaged, so it does not depend on which side faces the camera. Only trunk joints (both shoulders and hips) are required, because the chair can hide the legs (M0.5 S6).
- **Calibration** takes two still holds, each of `calibration.durationMs` (restarted by movement beyond `calibration.maxMotion`). Each records the shoulder height, the **trunk length** (shoulder midpoint to hip midpoint, pixels) and the **shoulder width** (distance between the shoulders, pixels).
  1. The patient is asked to sit still, then to stand still.
  2. The second hold counts only if its shoulder height differs from the first by at least `minStandRise` trunk lengths (of the first hold); a still pose closer than that is ignored.
  3. The lower of the two in the picture is the seated height, the higher the standing height, whichever came first. So a patient who stands still for a moment before sitting down is still calibrated correctly (found in the M2 manual set, 2026-11-28).

  An unreliable frame restarts calibration from the first hold. The set starts after the countdown, during which the patient sits down again. **After tracking loss, Resume repeats both holds** before the countdown, because the camera may have moved while the patient was at the laptop (in the M2 manual set, covering the camera tilted the laptop lid and moved the whole body about 45 px in the picture).
- **Progress** is the normalized height of the shoulders between the calibrated seated height (0) and standing height (1): (seated − current) / (seated − standing). It can go below 0 (leaning forward while seated) or above 1.
- **Attempt:** starts when progress rises above `sitFrac` and ends when it returns to `sitFrac` or below. Its `peak` is the highest progress reached.
- **Cycle:** seated (progress at most `sitFrac`), then standing (progress at least `standFrac`), then seated again. One full cycle is one repetition. The counter increases when the patient is seated again (AC 10). A dip below `standFrac` that does not reach `sitFrac` ("double bounce") stays in the same attempt.
- A rise that does not reach `standFrac` before returning to seated is an attempt that does not count. It has no tempo and no issue.
- **Rise time:** from the first frame above `sitFrac` to the first frame at or above `standFrac`. **Lower time:** from the first frame below `standFrac` after the last standing frame, to the first frame at or below `sitFrac`. Outside `riseMs` or `lowerMs` gives a `too_fast` or `too_slow` issue. An attempt lists each category once, even if both the rise and the lower had it.
- When the set starts, and after tracking loss, a new attempt can start only once progress is at or below `sitFrac`, so sitting down after the standing calibration is not a repetition, and a stand made while tracking was lost is never completed.
- **Body-size guard:** during the active set, a frame whose shoulder width differs from the calibrated width (the mean of the seated and standing holds) by more than `maxScaleChange`, as a fraction, is unreliable, exactly as if a required joint were out of view: no measurements, no cue, the attempt in progress discarded, and the set pauses after `tracking.unreliableAfterMs`. It catches the patient walking toward or away from the camera, for example to reach the laptop, which otherwise reads as sitting down (a false repetition in the M2 manual set). Worked example: calibrated widths 155 and 176 px give a reference of 165.5 px; with `maxScaleChange: 0.3`, widths from about 116 to 215 px are accepted.

Worked example: `minStandRise: 0.4`. A patient whose seated trunk length is 120 px must raise the shoulders at least 48 px above the seated height for the standing hold to count. With a seated height of y = 220 and a standing height of y = 124, a shoulder height of y = 140 is progress (220 − 140) / (220 − 124) = 0.83, below `standFrac: 0.85`.

### Shoulder raise (lateral, one arm)

- An attempt starts when elevation rises above `resetElevationDeg` and ends when it falls back below it.
- It counts as a repetition when peak elevation reaches the target (`targetElevationDeg` − `toleranceDeg`).
- Peak elevation below that gives an `insufficient_range` issue. Lean beyond `leanToleranceDeg` from the calibrated baseline at any time in the attempt gives a `trunk_lean` issue.

### Config consistency

The config loader rejects values that would make these definitions impossible:

- `startFlexionDeg` must be greater than `targetFlexionAtMostDeg` + `toleranceDeg`.
- `sitFrac` must be less than `standFrac`.
- `minStandRise` is between 0.05 and 2 trunk lengths; `maxScaleChange` between 0.05 and 1.
- `resetElevationDeg` must be less than `targetElevationDeg` − `toleranceDeg`.
- `cues.dwellMs` must have an entry for every `advice` rule.

## Tracking reliability

- A frame is **unreliable** if no pose is detected, if any required joint has visibility below `tracking.minVisibility`, or if any required joint lies within `tracking.boundsMargin` of the frame edge. Knee extension requires the chosen side's hip, knee and ankle. Sit-to-stand requires both shoulders and both hips, and during the set its frames must also pass the body-size guard (see Sit-to-stand above).
- On an unreliable frame during the set, the cue display clears, the attempt in progress is discarded, and the log row has `trackingOk: false`, no angle and no movement cue. After `tracking.unreliableAfterMs` of unreliable frames the set pauses ("can't see you well").
- **Stalled camera:** if no frame is delivered for more than two frame intervals at `tracking.minFps` (2 × 1000 / `minFps` ms of wall time), the app injects "no pose" frames, so a frozen camera counts as unreliable tracking. With `minFps: 12` that is about 167 ms.

## Cue conditions (seated knee extension)

Every cue passes through one cue gate (PLANS.md §2). A condition must hold for its `cues.dwellMs` before the cue is shown. Each episode of a condition shows its cue at most once, the same rule is not shown again within `cues.cooldownMs`, and a cue stays up for `cues.displayMs` or until replaced. When a new attempt starts, an advice cue about an earlier attempt is cleared at once, so advice is never on screen during an attempt it does not describe (for example "straighten more" while the next attempt is already at the target, AC 9). Positive feedback is not cleared this way. Advice wins over positive feedback on the same frame.

| Rule ID | Kind | Condition holds | `attemptIndex` |
|---|---|---|---|
| `KE-RANGE-LOW` | advice | From the frame an attempt ends without reaching the target band, until the next attempt starts | The attempt that fell short |
| `KE-HOLD-BREAK` | advice | From the frame a running hold breaks, until the knee re-enters the band, the hold completes, or the next attempt starts | The attempt whose hold broke |
| `KE-HOLD-DONE` | positive | The frame a hold completes and the repetition is counted (an event, no dwell) | The counted attempt |

A cue that would commit on the frame that completes the last repetition is not shown or logged, because the summary replaces the set screen on that frame. So the final `KE-HOLD-DONE` of a completed set has no cue event. The exception is advice about the final attempt (M2): if an advice condition holds on that frame, counting stops and the set screen stays up until that cue has been shown for `cues.displayMs`, or until it can no longer be shown (blocked by `cues.cooldownMs`). An unreliable frame ends the set at once. No knee rule holds on that frame, so knee behaviour is unchanged; for sit-to-stand it lets the last repetition's lower-tempo cue appear (AC 11).

`KE-RANGE-LOW` is tied to the end of the attempt on purpose: it never fires during an attempt that later reaches the target, so per-attempt scoring (O-8) is not penalized for a patient who is still moving. Its feedback delay therefore includes the configured dwell.

## Cue conditions (sit-to-stand)

The same cue gate rules apply as for the knee. Tempo is judged when each part of the cycle completes, never while the patient is still moving.

| Rule ID | Kind | Condition holds | `attemptIndex` |
|---|---|---|---|
| `STS-RISE-FAST` / `STS-RISE-SLOW` | advice | From the frame progress reaches `standFrac` with a rise time below / above `riseMs`, until the next attempt starts | The attempt that rose |
| `STS-LOWER-FAST` / `STS-LOWER-SLOW` | advice | From the frame the repetition counts (seated again) with a lower time below / above `lowerMs`, until the next attempt starts | The counted attempt |
| `STS-TEMPO-GOOD` | positive | The frame a repetition counts with both times in range (an event, no dwell) | The counted attempt |

## Best angle

Peak extension (smallest flexion) for the knee, peak elevation for the shoulder **(confirm)**. Sit-to-stand measures no angle: its summary reports tempo instead (mean and per-repetition rise and lower times against `riseMs` and `lowerMs`; owner decision, 2026-11-27).

## Issue categories

The shared vocabulary of rule IDs (`src/core/rules/registry.ts`) and therapist labels.

| Category | Meaning | Rule IDs |
|---|---|---|
| `insufficient_range` | Target angle not reached in the attempt | `KE-RANGE-LOW`, `SR-RANGE-LOW` |
| `hold_break` | Knee hold broken before it completed | `KE-HOLD-BREAK` |
| `too_fast` | Rise or lower faster than the configured range | `STS-RISE-FAST`, `STS-LOWER-FAST` |
| `too_slow` | Rise or lower slower than the configured range | `STS-RISE-SLOW`, `STS-LOWER-SLOW` |
| `trunk_lean` | Sideways lean beyond tolerance from baseline | `SR-LEAN` |

Rule kinds: `advice` rules carry a category and are scored. `positive` and `status` rules carry none and are not scored. Only `status` messages may show while tracking is unreliable.

## Feedback matching rule (O-8)

For each attempt, the therapist labels the set of issue categories that occurred. For each `advice` cue the app showed, its `attemptIndex` links it to an attempt.

- **True positive:** an advice cue whose category is among the therapist's issues for the same attempt. Several cues with the same category in one attempt count once.
- **False positive:** an advice cue whose category the therapist did not label for that attempt, or a cue with no attempt.
- **False negative:** a labeled issue in an attempt with no advice cue of that category.
- Precision = TP / (TP + FP). Recall = TP / (TP + FN). Both are per exercise.

App attempts are aligned to therapist attempts by time overlap (`tStart`–`tEnd` in the label file). An app attempt with no overlapping labeled attempt counts all its cues as false positives **(confirm the alignment tolerance in M6)**.

## Latency

Each `cue` event in the session log records three times (PLANS.md §5), all in ms on the frame clock:

- `onsetT`: the frame in which the rule's condition first became true.
- `confirmT`: the frame in which its dwell time (`cues.dwellMs[ruleId]`) was met.
- `shownAt`: the next animation frame after the cue was committed for display.

In a live session, `shownAt` is the frame-clock time of the first animation frame after the commit. Only cues published to the display get one. For a session replayed from a pose trace (`device.clock: 'trace'`) there is no display clock, so `shownAt` equals `confirmT`; delay is not measured from replays (PLANS.md §7).

**Feedback delay** is `shownAt − onsetT`. The report also gives `shownAt − confirmT`. The O-2 target is a median of 300 ms or less, with the worst case reported. Delay is measured in live sessions on target devices, not in replay (PLANS.md §7).

Tracking-loss delay is `tracking_lost.t − firstBadT` (AC 16: within 1 s).
