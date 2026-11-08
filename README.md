# maptap-beer

MapTap.beer is a daily brewery geography game: five breweries, one globe. This repository publishes the static edition to GitHub Pages.

## how-the-static-edition-works

The game ships as a prebuilt Cloudflare Workers release whose `/api` routes use a D1 database. GitHub Pages serves static files only, so the Pages build keeps the release's client bundle and runs the five API routes in the browser instead.

| Path | What it is |
| --- | --- |
| `release/client/` | Client assets copied from the prebuilt release (`dist/client`). |
| `release/html/` | Rendered HTML for `/`, `/licenses`, and the 404 page, captured from the release running locally. |
| `release/game.js` | The release's brewery catalog, flight picker, and scoring module. |
| `pages/local-api.mjs` | Browser versions of `/api/me`, `/api/game`, `/api/guess`, `/api/leaderboard`, and `/api/challenges`. |
| `pages/fetch-shim.js` | Routes the app's `/api` requests to `local-api.mjs`. |
| `scripts/build-pages.mjs` | Builds `site/` for a base path. |
| `scripts/features.mjs` | Place filters, GABF cards, country labels, title case, and feature flags applied by the build. |
| `pages/components.js` | The place filter and GABF card components injected into the app bundle. |
| `pages/features.json` | Feature flags. `"crew": false` hides The Crew. |
| `release/regions.json` | Region or state for every brewery, from the Open Brewery DB snapshot the release was built from. |
| `release/gabf.json` | GABF medal summary and gabf.beer page for each medal-winning brewery. |
| `scripts/import-data.mjs` | Regenerates the two data files above. |
| `scripts/test-local-api.mjs` | Plays full flights and challenge round trips against the built site. |
| `scripts/serve-pages.mjs` | Serves `site/` under a base path the way Pages does. |
| `.github/workflows/pages.yml` | Builds, tests, and deploys on every push to `main`. |

Behaviour on the static site:

- The daily flight uses the same seed as the hosted game, so everyone gets the same five breweries each UTC day.
- Scoring, distance, and round validation match the Worker routes exactly.
- Games are saved in the player's browser (`localStorage`). Clearing site data clears them.
- A crew challenge is encoded in its share link, so anyone with the link plays the same flight without a server.
- The leaderboard shows the best score on this device. A shared leaderboard and account sign-in need the hosted service.

## build-and-preview

Requires Node.js 22 or later. No install step.

```sh
cd "$HOME/projects/active/MapTap.beer/maptapbeer" && node scripts/build-pages.mjs --base /maptap-beer/ && node scripts/test-local-api.mjs && node scripts/serve-pages.mjs --base /maptap-beer/ --port 4791
```

Open http://127.0.0.1:4791/maptap-beer/. For a custom domain, add a `CNAME` file at the repository root and build with `--base /`; the workflow reads the base path from the Pages configuration.

## updating-from-a-new-release

1. Replace `release/client/` with the new `dist/client/`, leaving out `.vite`, `.assetsignore`, and `_headers`.
2. Copy the new `dist/server/_next/static/game-*.js` to `release/game.js`.
3. Start the release locally (`npm start` in the release folder) and save `/`, `/licenses`, and any unknown path from `http://127.0.0.1:8787` to `release/html/index.html`, `licenses.html`, and `404.html`.
4. Run the build. It stops with a message if a patched string in the bundle has changed.

## fixes-applied-at-build

- Globe crash (all browsers): globe.gl clears its container on init, and the container was the React-managed `.globe-wrap`. When the globe finished loading, React's removal of the loading message threw `NotFoundError: removeChild` and the root error boundary replaced the page with "This page couldn't load". The build mounts the globe in its own child element. This defect is also present in the Workers release and should be fixed in the app source.
- Root-relative URLs (assets, API, share links, the inline RSC payload, CSS images) are rewritten for the Pages base path.
- Account-only copy and links (sign in, sign out, private-site notice) are replaced with text that matches the static site.
- Invisible "Next brewery" button (all browsers): `.primary-btn` transitioned `background`, so the newly mounted result button started from the button reset's transparent value and showed cream text on white for up to three seconds. The build transitions `transform` only.
- Holes in the land (all browsers): large country fills were tessellated coarsely enough to dip below the curved globe, so the ocean colour showed through in the Sahara, Scandinavia and Russia. The build tessellates caps at 1.5 degrees.
- Globe page wider than phones (all browsers): the one-column game grid used `1fr`, whose minimum is the content width, so the globe canvas pushed the card past the right edge. The build uses `minmax(0, 1fr)`.
- Modals pinned to the top-left corner (all browsers): the CSS reset zeroes the native `<dialog>` margin that centres it. The build restores `margin:auto`.

## accessibility-and-play-changes

- Contrast: every mid-tone text colour declared for a light surface is darkened, keeping its hue, to at least 4.6:1 against the darkest light panel; icons reach 3:1. The focus ring uses the ink colour instead of amber. `scripts/contrast-audit.js` audits the rendered page: evaluate it in the browser console in any state and it lists text below WCAG AA, accounting for opacity and translucent backgrounds. Disabled controls are exempt under WCAG and still appear in its output.
- Text size: no text below 11px (10px inside the progress steps); the decorative stamp is hidden on phones instead.
- Touch: on touch-first devices, zoom controls, header buttons and links get 44px targets, the help button stays visible below 850px, and the globe legend drops "Scroll to zoom".
- Screen readers: each round's score, distance and brewery are announced through a polite live region.
- Map: country names from Natural Earth label points, sized by label rank, and darker country borders (dark green on the atlas, warm white over satellite and night imagery).
- Phone play: on touch-first devices a tap on the globe places the pin and locks in the guess, the page scrolls to the result, and the flight advances after five seconds. A bar on the Next button shows the countdown; tapping it advances at once. Desktop keeps pin, then Lock in, then Next.

## places-gabf-and-flags

- Filters: Practice and the Brewery Atlas filter by Continent, Country, Region or State, and City, each option showing its brewery count. Practice disables places with fewer than five breweries. Filtered practice flights use the release's seeded picker, spread across the next level down; the Daily Flight is unchanged.
- GABF: breweries that have medaled at the Great American Beer Festival show a medal card on the atlas brewery card and on the round result, linking to their page on gabf.beer. Breweries are joined on their Open Brewery DB id: 369 of the 947 GABF medalists match a MapTap pin (439 pins).
- Country names: Natural Earth label points as HTML labels, shown only on the visible hemisphere, culled in rank order so they never overlap, with smaller countries appearing as you zoom in.
- Feature flags: set `"crew": true` in `pages/features.json` to bring back The Crew.

Refresh the data after a new GABF year or a new release (needs the release's Open Brewery DB snapshot, which the script verifies by SHA-256, and a GABF Analysis checkout):

```sh
cd "$HOME/projects/active/MapTap.beer/maptapbeer" && curl -sSL -o "$TMPDIR/obdb-breweries.json" https://raw.githubusercontent.com/openbrewerydb/openbrewerydb/master/breweries.json && node scripts/import-data.mjs --obdb "$TMPDIR/obdb-breweries.json" --gabf "$HOME/projects/inactive/gabf-analysis"
```

The Open Brewery DB master branch moves on; when its hash no longer matches, fetch the commit the release was built from instead.

## licenses

Third-party licenses and the brewery data notice ship with the site at `/licenses`. Brewery data comes from Open Brewery DB.
