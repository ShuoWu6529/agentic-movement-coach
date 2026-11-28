# M0.5 tracking-reliability spike: results

Recorded 2026-11-27 by a team member recording themselves (O-5 allows this for the spike; it does not cover volunteers). This is a development measurement of one person on one laptop. It is **not** clinical evidence, and nothing here is a clinical standard.

## Verdict

**Pass, on the only supported device (laptop webcam, `full` model).** The gate the app already uses meets all three criteria in all eight scenarios. That gate is visibility ≥ `tracking.minVisibility` 0.5 and an in-frame check with `tracking.boundsMargin` 0.02 on the required joints, applied after the app's EMA smoothing.

| Criterion (PLANS.md §8, M0.5) | Required | Measured |
|---|---|---|
| Bad frames caught | ≥ 99% | **100%** (457 / 457) |
| Good frames flagged | < 2% | **0.32%** (6 / 1,862) |
| Every bad episode detected within | 500 ms of onset | **0 ms** (worst of 4 episodes) |

The result is not sensitive to the threshold. Every visibility threshold from 0.3 to 0.8 passes at margin 0 or 0.02. A margin of 0.05 fails (8.5% false alarms), because joints that are legitimately near the frame edge get rejected. **No config change is needed:** keep `minVisibility` 0.5 and `boundsMargin` 0.02.

No secondary signals (bone-length stability, jitter, presence) are needed for the gate. A brightness or jitter term is needed for the framing check (see dim light below).

## Setup

| | |
|---|---|
| Device | Laptop webcam, 1280 × 720, Chrome 158 on Windows (WSL2 dev server) |
| Model | MediaPipe pose landmarker `full`, GPU delegate, pinned sha256 as in `scripts/fetch-models.mjs` |
| Frame rate | 14.9–19.8 fps (camera-limited) |
| Inference | p50 10.7–11.3 ms, p95 11.6–12.4 ms |
| Clock | `requestVideoFrameCallback` with `captureTime` and `mediaTime` available |
| Exercise / side | Seated knee extension, left leg, side view (S6: sit-to-stand, 45° front-side) |
| Tool | `spike/` (local, not committed). Takes in `data/spike-takes/` (git-ignored, not committed). |

Phones and the `lite` model were dropped from v1 on 2026-11-27 (SPEC C-1, R-F1, O-6), so this laptop is the whole device matrix the criteria apply to.

**How the gate was scored.** The analyzer scores the gate exactly as the app runs it:
- landmark positions are smoothed with the app's EMA (alpha 0.5, read from `public/config/targets.json` 0.1-dev), with visibility and presence raw;
- then the bounds and visibility checks run.

This was cross-checked against the app's own `EmaSmoother` and `gateFrame` on 3,600 synthetic frames, with zero differences. Only the per-frame gate is measured. The app switches to "can't see you well" after a further `tracking.unreliableAfterMs` (300 ms), which is within AC 16's 1 s.

## Results per scenario (visibility 0.5, margin 0.02)

| Scenario | Expected | Result |
|---|---|---|
| S1 Knee extension, good setup | OK throughout | 0 / 387 flagged |
| S2 Sit still, good light | OK throughout | 0 / 291 flagged. Jitter 0.95% of torso length. |
| S3 Lower legs out of frame | BAD throughout | 297 / 297 caught. Off-frame hip, knee and ankle had median visibility 0.01–0.05. |
| S4 Camera covered (twice) | BAD while covered, ≤ 500 ms | 109 / 109 caught, 0 ms both times. 0 / 166 flagged otherwise. |
| S5 Sit still, dim light | Not judged | Gate passed 100% of frames at brightness 17 / 255 (vs about 105–114 in good light). Jitter 3.61% of torso, **3.8× good light**. |
| S6 Sit-to-stand, chair hiding legs | OK on trunk joints | 6 / 487 flagged (1.2%). All six: shoulders within the 0.02 top margin while standing (framing). |
| S7 Side view, legs overlapping | OK, no swaps | 0 / 292 flagged, 0 left/right swaps, chosen leg more visible in 100% of frames |
| S8 Joint leaves the frame mid-set (scripted, twice) | BAD while out, ≤ 500 ms | 51 / 51 caught, 0 ms both times. 0 / 239 flagged otherwise. |

## Answers to the spike's questions

1. **Does one gate setting pass on every device?** Yes, the app's current setting. See the verdict.
2. **Dim light.** The gate does not notice dim light. In S5 it passed every frame, while landmark jitter was 3.8× the good-light baseline. By the rule in PLANS.md M0.5, **the framing check needs a brightness or jitter term.** Today `framing.minLuma` (40) only picks the "room looks dim" message when the gate already fails. At brightness 17 the gate didn't fail, so a set could start in this room. Rough scale: jitter of 3.6% of torso length is a few centimetres of joint wobble per frame before smoothing. That could matter against the 5° angle-error goal. Follow-up below.
3. **Left/right swaps (S7).** None. The chosen leg was the more visible one in 100% of frames. The framing side check stays mandatory anyway (decided in M1). It costs nothing and covers other setups.
4. **Sit-to-stand with a chair (S6).** Median knee and ankle visibility was 0.12–0.73 and the far leg was mostly hidden. This confirms that the sit-to-stand engine must use trunk joints only (as planned for M2).
5. **Clocks and decoding.** Chrome on Windows provides `captureTime`, so latency can use capture time (`device.clock: 'captureTime'`). `canPlayType` reports H.264 and HEVC as "probably". No clip was decode-tested, because phones were dropped. Decoding for `extract` is checked in M6.

Other observations:
- **Off-frame joints can keep high visibility.** In an earlier, press-based S8 take, since deleted, the knee was reported at x = −0.04 (outside the image) with visibility 0.80. Only the bounds check caught it. In S3, by contrast, off-frame joints had near-zero visibility. Keep the bounds check; visibility alone is not enough.
- **A hand reaching for the lens blocks the leg first.** In S4, tracking of the leg failed up to 1.06 s before the image went dark. This is why the detection delay is 0 ms.

## Scoring rule changes made after seeing real takes

These changed how frames are judged after takes had been seen, so they are listed here in full. None changed the gate or its thresholds.

| Change | Why | Effect |
|---|---|---|
| An S4 cover is detected from loss of contrast as well as brightness. | Webcam auto-exposure lifted the covered image to about 49% of normal brightness (above the 35% threshold), while contrast fell to about 16%. The brightness-only rule ended each cover early. | This only changes how "lens covered" is read from the image (ground truth). |
| Frames in the 1.5 s before each S4 cover are not judged (owner approved). | All 26 remaining S4 false alarms fell within 1.06 s before a cover, while the arm and book crossed the leg. The leg was truly blocked, so the gate was right to flag it. | S4 false alarms went from 26 / 217 to 0 / 166. Caught and delay were unchanged. |
| S8 is scripted (owner approved): the page slides the model's image down by 0.6 of the frame height at 6–9 s and 15–18 s, and records the shift on every frame as the ground truth. | In two press-based takes, BAD/GOOD presses ran 1–6 s behind the image, against a 500 ms scoring window. Every miss and false alarm fell in that gap. | The model's response is real, but the joint leaves because the image moved, not because the body did. A physical exit is still covered by the M1 and M5 manual checks. |

Analyzer fixes made before any real take was scored: the verdict is per device/variant group rather than pooled; the app's smoothing is applied before gating; the model files are pinned.

## Re-takes and why

Each re-take was for a recording-procedure error confirmed in the data and flagged by the analyzer's take checks. None was re-taken because the gate did badly.

| Take | Problem | Action |
|---|---|---|
| S1, S4 (first trial) | Only the upper body was in view. Device tag missing on S1. | Deleted, re-recorded |
| S1 (second) | Ankle within 8% of the bottom edge in 42% of frames | Deleted, re-recorded |
| S4 (second) | Lens covered from the start of the take; operator not back in position afterwards | Deleted, re-recorded |
| S8 (two press-based takes) | Presses 1–6 s late | Deleted, replaced by scripted S8 |
| S8 (first scripted) | Extended foot past the left edge of the image (ankle x down to −0.02) | Deleted, re-recorded |

## Limitations

- **Small sample:** one person, one laptop, one browser, one session, and mostly one take per scenario. Frames within a take are not independent, so the percentages overstate the precision of the result.
- **Unrepresentative setup:** the recordings were made by the developer, who knew the setup well. Patients will frame themselves less carefully. The framing check is what guards that.
- **Dim light:** only one dim-light condition was recorded.
- **Scripted S8:** this is an image shift, not a physical movement out of view.
- **Two S4 scoring rules** were set after seeing S4 data (listed above).
- **Unmeasured exercises:** sit-to-stand was recorded only for leg visibility, and shoulder raise wasn't recorded. Their required joints are measured when M2 and M3 are built.

## Follow-ups for the plan

1. **Dim-light framing term (M5, required by this spike).** Make the framing check refuse to start a set in a room as dim as S5, even when the gate passes. The simplest option is to block on `framing.minLuma`, which is already in the config. That changes behaviour but not the config shape. A jitter term would need a new config field and a `schemaVersion` bump. Choose and tune the threshold on development data only.
2. **The M5 gate measurement is satisfied by this spike.** Re-measure if the gate logic, the smoothing, the model file or the thresholds change.
3. **Sit-to-stand uses trunk joints only (M2), as planned.** Give standing users headroom at the top of the frame: S6's only false alarms were shoulders at the top edge.
4. **Noise model for synthetic tests (§4):** these takes can supply jitter, dropout and visibility-dip statistics. They stay in `data/spike-takes/` and are never committed. Delete them once the noise model is built, or sooner if the owner prefers.
