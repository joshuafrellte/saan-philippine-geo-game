# Saan?

Saan? is a browser quiz for Philippine regions, provinces, and cities. The name is the Filipino word for "where." The page title and header live in `index.html`.

## How to play

Pick a mode from the row under the title. The place you are looking for is shown in gold in the question. Drag the map to move it. Pinch, or use the + and - buttons, to zoom. Reset returns to the whole country.

A wrong answer turns the feedback card red. A right answer turns it green. The card also names the regional center, capital, or host province, plus older names when the place has them.

Places you miss come back more often. The header counts them as "to review." Clear forgets that list. A correct answer lightens a miss by one.

### Daily

Name the day's province. You get six guesses. The puzzle changes at midnight in Manila, and everyone gets the same province that day.

Each wrong guess shows how far away it was, and which way to go. A streak counts only when you win on back-to-back days. Copy result shares the day's score. After the round, a clock counts down to the next province at midnight in Manila.

As you type, a list of provinces appears. Arrow keys move through it. Enter or a click submits the highlighted name. A province you already guessed is left off the list. Close spellings count, and so do older names.

### Regions

Click the named region on the map.

### Provinces

Click the named province. Pinch or use + to reach small islands.

### Cities

The question is either "Click this city" or "Which region is this city in?" The second kind keeps the city gold until you answer, then offers four regions.

The dashed badge shows how many cities are in the quiz. Open it to turn cities on or off, by city or by whole region. Major cities is a shorter set. Turn every city off and the quiz asks you to pick at least one.

The same panel can hide province borders, so a region reads as one shape, or hide city borders.

### Which region?

A province stays gold until you answer. Pick its region from four choices.

### Type it

The map highlights a region, a province, or a city. Type its name. The suggestion list only includes that kind of place, so a city question never offers provinces or regions. Two cities that share a name stay separate, such as San Carlos, Negros Occidental and San Carlos, Pangasinan.

Close spellings count, and so do older names. Dragging and zooming still work. Clicking a shape does not answer.

### Study

Study replaces the quiz. Choose regions, provinces, or cities, then hover a shape and open it. A card shows the regional center, capital, or city status, a link to the host province or region, and two or three short facts. Quiz returns to the question you left.

## Run it

```bash
npm install
npm run dev
```

Other scripts in `package.json`:

- `npm test` runs the Vitest suite.
- `npm run build` writes a production build.
- `npm run preview` serves that build.
- `npm run maps` rebuilds the GeoJSON. Run it after you change shapes, not after a spelling fix.

The app is Vite and plain JavaScript. The map uses `d3-geo` and `d3-zoom`.

## Project map

- `index.html` is the page shell.
- `src/main.js` draws the screen, the score, the settings dialog, and the answer card.
- `src/quiz.js` builds each question and checks an answer.
- `src/map.js` draws the map. In Type it, shapes ignore clicks and hovers.
- `src/daily.js` picks the day's province, scores guesses, and writes the share text.
- `src/suggest.js` filters the suggestion list to the kind of place being asked.
- `src/fuzzy.js` accepts a name, an alias, or a close spelling, and rejects a guess that fits another place better.
- `src/memory.js` stores misses in the browser and brings them back more often.
- `src/study.js` builds a study card from `data/study.json`.
- `src/settings.js` stores the city list and the outline toggles in the browser.
- `src/atlas.js` joins `data/places.json` to the GeoJSON.
- `src/outline.js` builds a region outline from the shared edges of its provinces.
- `src/fit-city.js` and `scripts/fit-cities.mjs` pull a city edge onto its province or region outline when that edge already meets the border.
- `scripts/prepare-maps.mjs` writes `data/provinces.geojson`, `data/regions.geojson`, and `data/cities.geojson`.

## Sources

Land shapes come from geoBoundaries (CC BY 3.0 IGO) and Faeldon / PSGC (MIT). Regions include the Negros Island Region, and Sulu is in the Zamboanga Peninsula. That credit is also shown under the map.

Province outlines are simplified geoBoundaries ADM2 shapes. The BARMM special geographic area stays on the Faeldon maps. Region membership follows RA 12000 for the Negros Island Region and Executive Order No. 91 (2025) for Sulu.

## Editing places

Names, aliases, regions, and capitals live in `data/places.json`. Study facts live in `data/study.json`.

- Keep `id` the same when you only fix a spelling. The id is what ties a row to its shape.
- `region` must be a region id from the same file.
- A city's `province` is the geographic host. Leave it blank for Metro Manila.
- An independent city sets `"independent": true`. The quiz then says it governs itself, separate from that province.
- Each study entry needs two or three facts, and each fact should be at least a short sentence. Regions also need a `seat`, except the Negros Island Region, whose seat stays empty.
- Add a matching shape if you add a place, then run `npm run maps`.
