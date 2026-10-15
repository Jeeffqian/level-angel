# 🌍 World Map — Guess the Country

A 2D world map guessing game with **four modes** and two formats. Each round gives you a clue —
the country's name or its flag — and you either find that country on the map and click it, or pick
it out of four choices.
**Hover any country and its flag appears in the panel on the right.**

Everything is bundled locally — no internet connection is needed to play.

---

## Run it

**Easiest:** double-click `index.html`. It works straight from the file system.

Or serve it locally (useful if you want to edit while playing):

```bash
cd world-map-game
python -m http.server 8777
# then open http://127.0.0.1:8777/index.html
```

---

## How to play

| | |
|---|---|
| **Goal** | A clue shows up in the task card. Either click the matching country on the map, or pick the right answer out of four. |
| **Hover** | The right-hand flag panel shows the flag, English + Chinese name, region and area of whatever country the cursor is on. *(Map modes only — the map is read-only during a quiz.)* |
| **Correct** | The country flashes green. Points = `100 + streak bonus + speed bonus`. |
| **Wrong** | Your pick flashes red and the real answer pulses amber, so you learn it. |
| **Hint** | Click 💡 **Hint** and a 15-second ad plays — one of two advertisers, picked at random each time. Once it finishes, the country's **continent** is shown and every other continent fades out of the map. Closing the ad early gives you nothing. One hint per round. The ad time doesn't count against your speed bonus (or the blitz clock). |
| **Zoom** | Scroll wheel or the `＋ / － / ⤾` buttons. Drag to pan. `Esc` resets the view. |
| **Learn mode** | The 📚 button in the top bar (or on the start screen). See below. |

### The four modes

| Mode | What you see | What you do |
|---|---|---|
| **Country name** | A country name | Find it on the map and click it |
| **Flag** | A flag, shown large | Click the country the flag belongs to |
| **Flag quiz** | A country name | Pick its flag from **four** choices |
| **Country quiz** | A flag | Pick the country it belongs to from **four** choices |

The two quiz modes are multiple-choice: the four options sit in the task card and the map becomes a
read-only backdrop (a "Quiz mode" badge sits over it), so you can't simply hover to find the answer.
The distractors are drawn from **the same continent first**, which is what makes them worth learning.
Once you answer, the correct country is still highlighted on the map — so you always see where it was.

In the two map modes the country name stays hidden until you answer (right or wrong) when the flag is
the clue, so you always learn it.

### The two formats

| Format | |
|---|---|
| **Classic** | A fixed number of rounds — 10 / 20 / 50 / endless. |
| **Blitz** | **60 seconds, no round limit.** Score as much as you can before the clock hits zero. Streaks build a score *multiplier* (`×1.0` → `×2.0` at a 10-streak) instead of a flat bonus, and the clock turns red under 10 seconds. Watching a hint ad **pauses the clock**. |

Blitz works with any of the four modes.

### Options on the start screen

- **Mode** — the four modes above. Switching to a quiz mode hides the hover-name option (it doesn't
  apply) and switching away from the plain name mode defaults hover names to `Hide`.
- **Format** — `Classic` or `Blitz`. Picking Blitz retires the Rounds row and explains the rules.
- **Difficulty** — `Easy` = 73 largest countries, `Normal` = 111, `Hard` = all 174.
  The rule is a land-area threshold (≥300,000 / ≥90,000 / any km²), so Easy is the set of big, recognizable countries.
- **Rounds** — 10 / 20 / 50 / endless (classic only).
- **Country names while hovering** — `Show` (relaxed) or `Hide` (the flag is the only clue; real challenge).
  In both cases the flag is always shown on hover. Picking the **Flag** clue defaults this to `Hide`,
  and the start screen warns you when it is on `Show`.

Your personal best is saved in the browser, tracked **per difficulty, per mode and per format** — so a
flag quiz is never compared against a map run, and blitz never against classic.

---

## 📚 Learn mode

A no-scoring study mode for learning where countries are and what their flags look like.

- **Search** — type an English name, a Chinese name, or a **capital city** (`Brasília` finds Brazil).
- **Continent filter** — chips with country counts. Picking one fades every other continent off the map
  and narrows the list.
- **Country list** — every country with its flag, English + Chinese name and continent code.
  Click one and the map **flies to it** and loads its study card.
- **🎲 Jump to a random country** — good for self-testing: "which country is this?"
- **Click any country on the map** to study it, and **hover any country** to preview its flag —
  when you move away, the card reverts to the country you pinned.
- **Study card** for the selected country: flag, English + Chinese name, continent, capital,
  subregion, area, languages, currency and number of land neighbours.

You can switch between playing and studying at any time with the top-bar button.

---

## Files

```
world-map-game/
├── index.html                 the game
├── styles.css                 all styling
├── game.js                    game logic
├── build-metadata.js          regenerates the country tables from upstream sources
└── assets/
    ├── data.js                bundled map geometry + country metadata (makes file:// work)
    ├── countries-110m.json    raw TopoJSON world map (source copy)
    ├── countries-meta.json    country name / ISO code / continent / region / area table
    ├── d3.min.js              d3 v7
    ├── topojson-client.min.js TopoJSON → GeoJSON
    └── flags/svg/*.svg        255 country flag SVGs
```

### Editing the ads

Ads are data, not markup. The `ADS` table near the top of `game.js` holds one entry per advertiser:

```js
{
  id:    'casamio',                          // must match a .ad-<id> theme in styles.css
  url:   'https://casamio3d.com/',
  title: 'Casamio 3D — Virtual home tours',
  body:  '...<b>3D tours</b>...',            // limited inline HTML
  cta:   'Browse 3D listings ↗',
  art:   ['⌂', '⟳', '▦', '▶', '⛶']           // 5 tile glyphs
}
```

The countdown length is the `AD_SECONDS` constant at the top of `game.js`.

**Two advertisers, picked at random** — each time the hint is used, one is chosen, never the same
one twice in a row (with only two entries that means they alternate). To add a third, append an
entry to `ADS` and add a matching `.ad-creative.ad-<id>` + `.ad-<id> .ad-art .t1…t5` block to
`styles.css` for its colour scheme.

### Adding another mode

A mode is just a value of `state.clue`, plus an entry in the label/description tables:

```js
const CLUE_LABEL = { …, flagQuiz: 'Flag quiz', countryQuiz: 'Country quiz' };
const CLUE_DESC  = { …, flagQuiz: '…', countryQuiz: '…' };
```

Then three small hooks:

1. **Start screen** — add a `<button class="chip" data-v="…">` to the `#chipsClue` chips in
   `showStartScreen()`.
2. **The prompt** — `renderPrompt(key)` decides what the task card shows. Map modes let the player
   click the map; multiple-choice modes call `renderQuizOptions(key)` and list themselves in
   `QUIZ_CLUES`, which flips the app into `mode-quiz` (map read-only, hover card hidden).
3. **Answering** — everything funnels through one `answer(key)` function, so scoring, streaks, the
   log, the toast and the next round all work unchanged whichever way the round was answered.

`bestKey()` automatically namespaces the personal best by difficulty + mode + format, so a new mode
never collides with an existing one. `state.format` works the same way: `classic` uses `state.rounds`,
`blitz` swaps it for a countdown (see `startBlitz` / `tickBlitz`).

### Rebuilding the country tables

```bash
node build-metadata.js
```

This re-downloads the upstream sources, re-joins them, derives the continent for each country and
rewrites `assets/countries-meta.json` + `assets/data.js`. Run it if you want to change the continent
rules (see `TRANSCONTINENTAL` and `MANUAL` in that file).

---

## Where the data came from

| Asset | Source |
|---|---|
| World map geometry (177 countries, 1:110m scale) | [Natural Earth](https://www.naturalearthdata.com/) via the [`world-atlas`](https://github.com/topojson/world-atlas) TopoJSON package (`cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`) |
| Country names, ISO codes, region, area, Chinese names | [`world-countries`](https://www.npmjs.com/package/world-countries) (`cdn.jsdelivr.net/npm/world-countries@5/countries.json`) |
| Flags | [hampusborgos/country-flags](https://github.com/hampusborgos/country-flags) |
| d3 / topojson-client | [d3js.org](https://d3js.org/), [topojson/topojson-client](https://github.com/topojson/topojson-client) |

The map is drawn as SVG from the downloaded data with an equirectangular projection, so it is a
genuine vector 2D world map — it stays crisp at any zoom level.

**Continents** are derived from each country's `region` + `subregion`: the `Americas` region is split
into North / South America, `Antarctic` becomes Antarctica, and the six genuinely transcontinental
countries (Russia, Turkey, Kazakhstan, Georgia, Azerbaijan, Egypt) list both continents. Antarctica
itself is never a guessing target.

**Note:** at 1:110m resolution very small countries (Singapore, Malta, Luxembourg, Monaco…) have no
polygon in the dataset, so they are not in the guessing pool. Two territories have no flag on file
(Northern Cyprus, Somaliland) — they are still hoverable but never appear as an answer.

---

## Tests

`_test/run.js` drives a real Chrome through the whole game (**64 assertions**: rendering, hover → flag
panel, correct/wrong feedback, the 15-second ad and hint gating, both ad creatives, random ad
rotation, hint reset between rounds, skip, zoom, end-of-game summary, learn mode — list, search in
three languages, continent filtering, fly-to, study card contents, hover preview/restore, mode
switching — the flag clue mode end to end, the flag quiz and country quiz modes end to end, quiz
best-score namespacing, the blitz clock and its timeout ending, responsive resize, console errors).
It takes about two minutes because it genuinely waits out the ad twice.

The suite serves the game from `_test/serve.js` on port 8779 — a small Node static server. `python -m
http.server` has a listen backlog of 5, and the game's burst of ~255 flag preloads can make a few of
them come back `ERR_CONNECTION_REFUSED`, which made the console-cleanliness assertion flaky.

```bash
NODE_PATH="<playwright-core node_modules>" node _test/run.js
```
