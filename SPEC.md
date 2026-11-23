# AI Movement Coach for Physical Therapy: Specification

Status: draft v0.2 (pilot). Decisions agreed in planning and in the open-decisions review are recorded in [Decided](#decided); items still open are in [Still open](#still-open).

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
| O-5 | **Consent and ethics route:** not started. Institutional IRB or equivalent, consent form wording, video retention, and sharing terms. | Gates any recording of people and any release of the videos. | Hard gate: no recording of volunteers until settled. |
| O-12 | **Hosting for the demo** (e.g. a static host) and the minimum supported phone and browser. | Affects how reviewers run the demo (criterion 28). | Before the demo is shared. |
