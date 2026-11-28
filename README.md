# agentic-movement-coach

Browser app for the AI Movement Coach pilot. **Experimental, not clinically validated.** Pose tracking runs on the device; no video leaves the browser. See `SPEC.md` for requirements and `PLANS.md` for the design and status.

## Run locally

Requires Node 22 or later (CI uses Node 24).

```bash
npm ci
npm run dev
```

Open http://localhost:5173, choose an exercise, and allow camera access.

- **Seated knee extension:** choose the leg, and place the camera to your side so that leg is nearer to it.
- **Sit-to-stand:** place the camera in front of you, turned about 45° to one side, far enough back that your head and shoulders stay in the picture when you stand. Calibration asks you to sit still, then stand still; sit down again during the countdown.

v1 supports a laptop or desktop webcam only, not phones or tablets.

Therapist targets live in `public/config/targets.json`. Edit the file and reload the page to apply changes.

## Checks

```bash
npm test             # unit and component tests
npm run build        # also fetches and verifies the pose models
npm run test:e2e     # Playwright on the build (first run: npx playwright install chromium)
```

## Research export

After a set, **Research export** on the summary saves the session log (JSON) and, for camera sessions, the pose trace, to this device only. A saved pose trace can be replayed through a set of either exercise from **Research: replay a recorded pose trace** on the exercise screen.
