# agentic-movement-coach

Browser app for the AI Movement Coach pilot. **Experimental, not clinically validated.** Pose tracking runs on the device; no video leaves the browser. See `SPEC.md` for requirements and `PLANS.md` for the design and status.

## Run locally

Requires Node 22 or later (CI uses Node 24).

```bash
npm ci
npm run dev
```

Open http://localhost:5173, choose **Seated knee extension** and the leg, and allow camera access. Place the camera to your side so the chosen leg is nearer to it.

To test on a phone on the same network, use `npm run dev:https` and open the LAN address it prints. Phones need https for camera access, so accept the self-signed certificate warning.

Therapist targets live in `public/config/targets.json`. Edit the file and reload the page to apply changes.

## Checks

```bash
npm test             # unit and component tests
npm run build        # also fetches and verifies the pose models
npm run test:e2e     # Playwright on the build (first run: npx playwright install chromium)
```

## Research export

After a set, **Research export** on the summary saves the session log (JSON) and, for camera sessions, the pose trace, to this device only. A saved pose trace can be replayed through the set from **Research: replay a recorded pose trace** on the exercise screen.
