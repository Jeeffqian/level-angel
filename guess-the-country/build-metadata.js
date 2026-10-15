/* ============================================================
   Rebuilds assets/countries-meta.json and assets/data.js from the
   upstream sources. Run with:

     node build-metadata.js

   Sources (downloaded on demand if not already cached):
     - world-atlas@2  countries-110m.json  (Natural Earth 1:110m TopoJSON)
     - world-countries@5 countries.json    (names, ISO codes, region, area)
   ============================================================ */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ASSETS = path.join(__dirname, 'assets');
const CACHE = path.join(__dirname, '.cache');

const SOURCES = {
  topo: {
    url: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
    file: path.join(ASSETS, 'countries-110m.json')
  },
  world: {
    url: 'https://cdn.jsdelivr.net/npm/world-countries@5/countries.json',
    file: path.join(CACHE, 'world-countries.json')
  }
};

/* Continent names, English + Chinese. */
const CONTINENTS = {
  Africa: '非洲',
  Asia: '亚洲',
  Europe: '欧洲',
  'North America': '北美洲',
  'South America': '南美洲',
  Oceania: '大洋洲',
  Antarctica: '南极洲'
};

/* Countries that genuinely straddle two continents get both listed. */
const TRANSCONTINENTAL = {
  RU: ['Europe', 'Asia'],
  TR: ['Asia', 'Europe'],
  KZ: ['Asia', 'Europe'],
  GE: ['Asia', 'Europe'],
  AZ: ['Asia', 'Europe'],
  EG: ['Africa', 'Asia']
};

/* Territories with no ISO numeric id in the TopoJSON. */
const MANUAL = {
  Kosovo: {
    zh: '科索沃', c: 'xk', ct: 'Europe', a: 10887, r: 'Europe',
    cap: 'Pristina', sub: 'Southeast Europe', lang: 'Albanian, Serbian',
    cur: 'Euro (€)', bord: 4
  },
  'N. Cyprus': {
    zh: '北塞浦路斯', c: null, ct: 'Asia', a: 3355, r: 'Asia',
    cap: 'North Nicosia', sub: 'Western Asia', lang: 'Turkish',
    cur: 'Turkish lira (₺)', bord: 1
  },
  Somaliland: {
    zh: '索马里兰', c: null, ct: 'Africa', a: 176120, r: 'Africa',
    cap: 'Hargeisa', sub: 'Eastern Africa', lang: 'Somali, Arabic',
    cur: 'Somaliland shilling (Sl)', bord: 3
  }
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const out = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode >= 300 && res.headers.location) {
        out.close();
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(url + ' -> HTTP ' + res.statusCode));
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
    }).on('error', reject);
  });
}

async function load(src, label) {
  if (!fs.existsSync(src.file)) {
    console.log('downloading ' + label + ' ...');
    await download(src.url, src.file);
  }
  return JSON.parse(fs.readFileSync(src.file, 'utf8'));
}

/* region + subregion -> a single continent */
function continentOf(c) {
  const r = c.region;
  const s = c.subregion || '';
  switch (r) {
    case 'Africa':    return 'Africa';
    case 'Asia':      return 'Asia';
    case 'Europe':    return 'Europe';
    case 'Oceania':   return 'Oceania';
    case 'Antarctic': return 'Antarctica';
    case 'Americas':  return s === 'South America' ? 'South America' : 'North America';
    default:          return r || 'Unknown';
  }
}

/* "Brazilian real (R$), ..." */
function currencyText(c) {
  const cur = c.currencies || {};
  return Object.keys(cur)
    .map(code => {
      const o = cur[code] || {};
      return o.symbol ? `${o.name} (${o.symbol})` : (o.name || code);
    })
    .join(', ');
}

function languageText(c) {
  const l = c.languages || {};
  return Object.keys(l).map(k => l[k]).join(', ');
}

(async () => {
  const topo = await load(SOURCES.topo, 'world map');
  const world = await load(SOURCES.world, 'country metadata');

  const byCcn3 = {};
  world.forEach(c => { byCcn3[c.ccn3] = c; });

  const flagDir = path.join(ASSETS, 'flags', 'svg');
  const haveFlag = new Set(
    fs.existsSync(flagDir) ? fs.readdirSync(flagDir).map(f => f.replace(/\.svg$/, '')) : []
  );

  const meta = {};

  topo.objects.countries.geometries.forEach(g => {
    const raw = g.properties.name;

    if (g.id == null) {
      const m = MANUAL[raw];
      if (!m) { console.warn('skipping unmapped geometry: ' + raw); return; }
      meta['raw:' + raw] = {
        n: raw, zh: m.zh, c: m.c, f: !!(m.c && haveFlag.has(m.c)),
        a: m.a, r: m.r, ct: m.ct, ctz: CONTINENTS[m.ct], k: m.ct, ll: null,
        cap: m.cap, sub: m.sub, lang: m.lang, cur: m.cur, bord: m.bord
      };
      return;
    }

    const c = byCcn3[g.id];
    if (!c) { console.warn('no metadata for id ' + g.id + ' (' + raw + ')'); return; }

    const code = c.cca2.toLowerCase();
    const multi = TRANSCONTINENTAL[c.cca2];
    const list = multi || [continentOf(c)];

    meta[g.id] = {
      n: c.name.common,
      zh: (c.translations.zho && c.translations.zho.common) || c.name.common,
      c: code,
      f: haveFlag.has(code),
      a: c.area,
      r: c.region || '',
      ct: list.join(' / '),                                  // display: "Asia / Europe"
      ctz: list.map(x => CONTINENTS[x] || x).join(' / '),    // display: "亚洲 / 欧洲"
      k: list[0],                                            // primary continent, for grouping
      ll: c.latlng,
      cap: (c.capital && c.capital[0]) || '',
      sub: c.subregion || '',
      lang: languageText(c),
      cur: currencyText(c),
      bord: (c.borders || []).length
    };
  });

  const metaPath = path.join(ASSETS, 'countries-meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta));

  const dataPath = path.join(ASSETS, 'data.js');
  fs.writeFileSync(dataPath,
    '/* Bundled map data — lets the game run straight from the file system. */\n' +
    'window.MAP_DATA=' + JSON.stringify({ topo, meta }) + ';\n');

  const keys = Object.keys(meta);
  const counts = {};
  keys.forEach(k => { const c = meta[k].k; counts[c] = (counts[c] || 0) + 1; });

  console.log('countries: ' + keys.length);
  console.log('no flag  : ' + keys.filter(k => !meta[k].f).map(k => meta[k].n).join(', ') || 'none');
  console.log('continents:');
  Object.keys(counts).sort().forEach(c => console.log('  ' + c.padEnd(15) + counts[c]));
  console.log('wrote ' + path.relative(__dirname, metaPath) + ' and ' + path.relative(__dirname, dataPath));
})().catch(e => { console.error(e); process.exit(1); });
