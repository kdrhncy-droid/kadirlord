<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/eee708f7-32ac-4b0c-b347-b0231cc68b2c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm ci`
2. Optionally set `GEMINI_API_KEY` in [.env.local](.env.local). Without it,
   lord diplomacy uses the deterministic local fallback.
3. Run the app:
   `npm run dev`

## Verification

- Fast static/gameplay checks: `npm run verify:fast`
- Full probe chain: `npm run verify:all`
- Real Chromium end-to-end checks (first run): `npm run setup:e2e`
- Browser tests after setup: `npm run test:e2e`

Agents should read [AGENTS.md](AGENTS.md) before changing gameplay code.
The browser harness is documented in [tools/e2e/README.md](tools/e2e/README.md).
