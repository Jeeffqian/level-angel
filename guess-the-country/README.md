# 🌍 World Map — Guess the Country

A 2D world map guessing game. The game names a country; you find it on the map and click it.
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
| **Goal** | A country name shows up under *Find this country*. Click that country on the map. |
| **Hover** | The right-hand flag panel shows the flag, English + Chinese name, region and area of whatever country the cursor is on. |
| **Correct** | The country flashes green. Points = `100 + streak bonus + speed bonus`. |
| **Wrong** | Your pick flashes red and the real answer pulses amber, so you learn it. |
| **Hint** | Click 💡 **Hint** and a 15-second ad plays — one of two advertisers, picked at random each time. Once it finishes, the country's **continent** is shown and every other continent fades out of the map. Closing the ad early gives you nothing. One hint per round. The ad time doesn't count against your speed bonus. |
| **Zoom** | Scroll wheel or the `＋ / － / ⤾` buttons. Drag to pan. `Esc` resets the view. |
| **Learn mode** | The 📚 button in the top bar (or on the start screen). See below. |

### Options on the start screen

- **Difficulty** — `Easy` = 73 largest countries, `Normal` = 111, `Hard` = all 174.
  The rule is a land-area threshold (≥300,000 / ≥90,000 / any km²), so Easy is the set of big, recognizable countries.
- **Rounds** — 10 / 20 / 50 / endless.
- **Country names while hovering** — `Show` (relaxed) or `Hide` (the flag is the only clue; real challenge).
  In both cases the flag is always shown on hover.

Your personal best per difficulty is saved in the browser.

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

`_test/run.js` drives a real Chrome through the whole game (37 assertions: rendering, hover → flag
panel, correct/wrong feedback, the 15-second ad and hint gating, both ad creatives, random ad
rotation, hint reset between rounds, skip, zoom, end-of-game summary, learn mode — list, search in
three languages, continent filtering, fly-to, study card contents, hover preview/restore, mode
switching — responsive resize, console errors). It takes about a minute because it actually waits
out the ad.

```bash
NODE_PATH="<playwright-core node_modules>" node _test/run.js
```
