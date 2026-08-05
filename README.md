# CivicScan — Online Voting System with Facial Recognition

A front-end demo of a biometric-gated voting flow: **enroll → face scan → login → vote → live results.**

## Project structure
```
civic-vote-project/
├── index.html      # Page structure (register, scan, login, home/vote screens)
├── css/
│   └── style.css   # All styling, layout, animations
├── js/
│   └── app.js       # App logic: camera, face detection, state, storage, voting
└── README.md
```

## How to run
Just open `index.html` in a modern browser (Chrome or Edge recommended — they support
the native `FaceDetector` API used for the scan step). No build step, no server, no
dependencies to install.

If you want to serve it locally instead of opening the file directly (some browsers
restrict camera access on `file://` URLs), run from this folder:
```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## How the flow works

1. **Register** (`#screen-register`) — enter a name + voter ID, then capture a
   reference face photo from your webcam. This is your enrollment record.
2. **Face scan gate** (`#screen-scan`) — required *every time* before login. Runs a
   live scanning animation and attempts real on-device detection via the browser's
   `FaceDetector` API when available. If the API or a camera isn't available, it
   gracefully falls back to a simulated scan so the flow never gets stuck.
3. **Login** (`#screen-login`) — only reachable once the face scan has passed for
   this session. Voter ID + password (password is illustrative only in this demo —
   identity is established by the face scan).
4. **Home / Vote** (`#screen-home`) — pick one candidate and submit. One vote per
   enrolled profile is enforced. A "Live results" tab shows a running tally.

## Data & storage
This is a pure front-end demo — no server, no database. Data is stored in the
browser's `localStorage`:
- Your enrollment profile (name, voter ID, face snapshot, voted flag).
- Vote tallies for the results tab.

**Important limitation:** `localStorage` is per-browser/per-device, so the "live
results" tab reflects votes cast *in that one browser* only — it is **not** a
real multi-user shared tally. Open the app in a different browser (or incognito)
and you'll see a fresh, empty tally. This is intentional for a client-only demo;
see the roadmap below for what a real deployment needs.

## Important: this is a prototype, not production security
Face matching here is a **simulated/demo-level check** (presence detection +
scripted "match" sequence), not real biometric verification against a stored
face template. Treat this as a UI/UX and interaction-flow reference — not
something to deploy for an actual election.

## Roadmap — what a real deployment needs
This started as a second-year exploration of the UI/UX flow for a voting app.
To make it a genuine, production-grade multi-user system it would need:
- A backend (FastAPI/Flask/Node) with a real database, so votes and tallies are
  shared across users instead of living in one browser's `localStorage`.
- Server-side identity verification, replacing today's client-side face detection.
- Encrypted biometric template storage and liveness/anti-spoofing checks.
- An auditable, tamper-evident ballot store, plus independent security review.

## Customizing
- **Candidates**: edit the `CANDIDATES` array at the top of `js/app.js`.
- **Colors/fonts**: edit the CSS custom properties at the top of `css/style.css`
  (`:root { --ink, --panel, --teal, --gold, ... }`).
- **Copy/labels**: edit the corresponding text directly in `index.html`.
