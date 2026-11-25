# Definitions (v0, draft)

Status: draft for M0. These definitions decide what counts in manual counts, therapist labels and scoring, so they must be settled before M7 (PLANS.md §10). Items marked **(confirm)** are working assumptions (PLANS.md §11) to check with the therapist once one is recruited (O-4). Numbers in `code` are config fields in `public/config/targets.json`. Their values are tuned on development data only (R-E9).

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

Which angle is used (image-plane 2D or world 3D) per exercise is chosen from M0.5 and live testing (PLANS.md §10).

## Attempt and repetition

- An **attempt** is one movement cycle, whether or not it counts. Therapist labels and feedback scoring are per attempt (O-8).
- A **repetition** is an attempt that meets the exercise's completion rule below. Only repetitions increase the on-screen counter.
- An attempt in progress when tracking becomes unreliable is discarded: it is neither an attempt nor a repetition. Completed repetitions are kept (PLANS.md §3) **(confirm)**.

### Seated knee extension

- An attempt starts when flexion drops below `startFlexionDeg` and ends when flexion rises again by `reversalDeg` from the best (smallest) value reached, or returns above `startFlexionDeg`.
- It counts as a repetition when flexion stays within the target (`targetFlexionAtMostDeg` + `toleranceDeg`) continuously for `holdSeconds`.
- **Hold break:** flexion leaves the target band before `holdSeconds` have passed. The hold timer resets. If the attempt then ends without a completed hold, it is logged as not counted with a `hold_break` issue **(confirm)**.
- An attempt that never reaches the target band has an `insufficient_range` issue.

### Sit-to-stand

- Progress is the normalized height of the shoulders between the calibrated seated height (0) and standing height (1).
- **Cycle:** seated (progress at most `sitFrac`), then standing (progress at least `standFrac`), then seated again. One full cycle is one repetition.
- A rise that does not reach `standFrac` before returning to seated is an attempt that does not count.
- **Rise time:** from leaving `sitFrac` to reaching `standFrac`. **Lower time:** from leaving `standFrac` to reaching `sitFrac`. Outside `riseMs` or `lowerMs` gives a `too_fast` or `too_slow` issue.

### Shoulder raise (lateral, one arm)

- An attempt starts when elevation rises above `resetElevationDeg` and ends when it falls back below it.
- It counts as a repetition when peak elevation reaches the target (`targetElevationDeg` − `toleranceDeg`).
- Peak elevation below that gives an `insufficient_range` issue. Lean beyond `leanToleranceDeg` from the calibrated baseline at any time in the attempt gives a `trunk_lean` issue.

### Config consistency

The config loader rejects values that would make these definitions impossible:

- `startFlexionDeg` must be greater than `targetFlexionAtMostDeg` + `toleranceDeg`.
- `sitFrac` must be less than `standFrac`.
- `resetElevationDeg` must be less than `targetElevationDeg` − `toleranceDeg`.
- `cues.dwellMs` must have an entry for every `advice` rule.

## Best angle

Peak extension (smallest flexion) for the knee, peak elevation for the shoulder **(confirm)**.

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

**Feedback delay** is `shownAt − onsetT`. The report also gives `shownAt − confirmT`. The O-2 target is a median of 300 ms or less, with the worst case reported. Delay is measured in live sessions on target devices, not in replay (PLANS.md §7).

Tracking-loss delay is `tracking_lost.t − firstBadT` (AC 16: within 1 s).
