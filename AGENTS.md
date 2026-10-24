# AGENTS.md

Instructions for agents working on Saan?. Player-facing detail is in `README.md`. This file is the working agreement.

The app is Vite and vanilla JavaScript. There is no framework. Keep new UI in `src/main.js`, `src/style.css`, and the module that owns the behavior. Do not add a bundler, a UI library, or a backend.

## Commands

The shell is PowerShell. It has no `&&`. Chain commands with `;`.

```powershell
npm run dev
npm test
npm run build
npm run maps
```

`npm run dev` serves the quiz, usually at `http://127.0.0.1:5173/`. `npm warn Unknown env config "devdir"` is harmless. `npm run maps` rewrites `data/provinces.geojson`, `data/regions.geojson`, and `data/cities.geojson`. Do not run `scripts/fit-cities.mjs` by itself as a write. It only logs.

Do not commit, push, or edit plan files unless the user asks.

## Check UI in the browser

After a change to layout, copy, modes, or the map, exercise it in the browser: click, type, and move through the affected modes. A screenshot of one screen is not enough.

Lock the app tab before interacting, then unlock when finished. Prefer `browser_click` by ref. Do not use CDP `Input.*`. Device emulation lasts only for the current turn. Clear it with `Emulation.clearDeviceMetricsOverride` before you finish. Clicks from a screenshot are not CSS pixels.

## Copy

Text the player sees must not contain an em dash. That includes prompts, hints, feedback, study facts, and the document title. Write a sentence instead.

Keep `question.prompt` as the full sentence. Tests match `/^Click /` and `/^Which (region|province|city) is this\?/`. Highlight the place with `renderPrompt` and `<span class="prompt-target">`. Do not use `innerHTML`. In Type it, multiple choice, Daily before the reveal, and Study, highlight the kind word (`region`, `province`, or `city`), never the hidden answer.

Gold for a highlighted name and for the map target is `--gold` (`#f0b429`). A correct feedback card is a dim green wash. A wrong card is a dim red wash. Do not bring back the thin inset edge.

## Modes that are easy to break

- Cities mode opens at country zoom (`zoomIdentity`). Do not auto-zoom onto the answer. Manual pinch and + stay available. An answer reveal must not yank a zoom the player already set.
- Type it ignores clicks and hovers on shapes (`pointer-events: none` when `question.mode === "type"`). Pan and zoom stay. Do not use `clickable: false` for this. That flag also strips the gold highlight, because `classesFor` returns early when `inert` is set.
- Suggestions come from `suggestPlaces(catalog, query)`. Pass only the catalog for the question: cities, regions, or provinces. Daily passes `data.provinces` and excludes guesses already made. A picked suggestion submits that place's id. `checkAnswer` treats a matching id as correct in Type it, because duplicate city names would otherwise fail the fuzzy check.
- The city-count badge is a filter control. Update its label through `setCityCount()`. Assigning `textContent` on the button deletes the icon.
- NCR cities have `province: ""`. Their parent outline is the NCR landmark, not a province.

## Map geometry

Leave city outlines alone unless the user says a gap is still wrong. Inland cities must not be stretched across other municipalities. An edge moves onto the parent outline only when both ends are near that ring, the arc stays near this city, a neighbor does not claim it, and the area stays inside the gates in `src/fit-city.js` and `scripts/fit-cities.mjs`.

Do not start a Mindanao cleanup, drop the BARMM special geographic area, or refill inland seams unless the user asks.

If you do rebuild shapes:

- `npm run maps` is the only write path. It seats cities before provinces and regions are written, so parent outlines pick up the fit.
- `applyCommands` deletes cache entries. Pass a shallow copy, `{ ...files }`, and only the files that command needs.
- `-merge-layers` needs `force` when fields differ.
- Rewind polygons to the smaller `geoArea` before measuring. A clockwise ring reports as the rest of the Earth. Do not rewind MultiLineStrings.
- A second mapshaper clip after the snap cuts the snapped boundary back off. Do not add one.
- Projection that works: `+proj=merc +datum=WGS84`, buffer in meters, then `-proj wgs84`.

## Data

`data/places.json` owns names, aliases, capitals, and region ids. Keep `id` stable for a spelling fix. `data/study.json` needs two or three facts per place, each a short sentence. Region entries need a `seat`, except `nir`, whose seat stays empty.

`src/atlas.test.js` checks that `validateAtlas` is clean and that there are 149 cities (38 independent). It does not check coordinates. The place file currently also has 18 regions and 82 provinces. After a geometry rebuild, that test should still pass.
