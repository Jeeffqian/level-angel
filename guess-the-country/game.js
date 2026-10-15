/* ============================================================
   World Map — Guess the Country
   Data: Natural Earth 110m (via world-atlas) + ISO country metadata
   Everything is bundled locally, so the game runs offline.
   ============================================================ */

(function () {
  'use strict';

  const DATA = window.MAP_DATA;
  if (!DATA) { console.error('MAP_DATA missing'); return; }

  const META = DATA.meta;                      // key -> { n, zh, c, f, a, r, ll }
  const topo = DATA.topo;

  const FEATURES = topojson.feature(topo, topo.objects.countries).features
    .map(f => {
      const key = String(f.id != null ? f.id : 'raw:' + f.properties.name);
      f.__key = key;
      f.__meta = META[key] || null;
      return f;
    })
    .filter(f => f.__meta);

  /* ── DOM ─────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const svgEl      = $('map');
  const mapWrap    = document.querySelector('.map-wrap');
  const toastEl    = $('toast');
  const overlay    = $('overlay');
  const overlayPanel = $('overlayPanel');

  const flagImg    = $('flagImg');
  const flagEmpty  = $('flagEmpty');
  const flagNameEn = $('flagNameEn');
  const flagNameZh = $('flagNameZh');
  const flagMeta   = $('flagMeta');
  const flagHead   = $('flagCardHead');
  const hoverDot   = $('hoverDot');

  const taskLabel   = $('taskLabel');
  const taskFlag    = $('taskFlag');
  const taskFlagImg = $('taskFlagImg');
  const taskName = $('taskName');
  const taskZh   = $('taskZh');
  const taskHint = $('taskHint');
  const logEl    = $('log');
  const logCount = $('logCount');

  const adOverlay  = $('adOverlay');
  const adBar      = $('adBar');
  const adStatus   = $('adStatus');
  const adClaim    = $('adClaim');
  const adCreative = $('adCreative');

  const learnCard   = $('learnCard');
  const learnList   = $('learnList');
  const learnSearch = $('learnSearch');
  const learnChips  = $('learnContinents');
  const learnCount  = $('learnCount');
  const flagFacts   = $('flagFacts');

  const AD_SECONDS = 15;

  /* ── State ───────────────────────────────────────────── */
  const state = {
    mode: 'game',            // 'game' | 'learn'
    clue: 'name',            // 'name' → the country name is given | 'flag' → the flag is given
    difficulty: 'normal',    // 'easy' | 'normal' | 'hard'
    rounds: 20,              // 0 = endless
    namesOnHover: true,

    running: false,
    locked: false,
    target: null,
    round: 0,
    roundStart: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    wrong: 0,
    hinted: false,
    pool: [],
    queue: [],
    missed: [],
    hovered: null,
    pinned: null
  };

  const DIFF = {
    easy:   { minArea: 300000, label: 'Easy' },
    normal: { minArea: 90000,  label: 'Normal' },
    hard:   { minArea: 0,      label: 'Hard' }
  };

  /* Learn mode state */
  const CONTINENTS = ['all', 'Africa', 'Asia', 'Europe', 'North America',
                      'South America', 'Oceania', 'Antarctica'];
  const CT_SHORT = {
    Africa: 'AF', Asia: 'AS', Europe: 'EU', 'North America': 'NA',
    'South America': 'SA', Oceania: 'OC', Antarctica: 'AN'
  };
  const learnFilter = { continent: 'all', query: '' };
  let selectedKey = null;

  /* ── Helpers ─────────────────────────────────────────── */
  const flagUrl = code => code ? 'assets/flags/svg/' + code + '.svg' : null;

  function flagImgEl(code, cls) {
    if (!code) { const s = document.createElement('span'); s.textContent = '🏳'; return s; }
    const i = document.createElement('img');
    i.src = flagUrl(code);
    i.alt = '';
    if (cls) i.className = cls;
    return i;
  }

  const shuffle = a => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const fmtArea = a => a > 0 ? d3.format(',')(a) + ' km²' : '—';

  const escapeHtml = s => String(s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Best score is tracked per difficulty *and* per clue, so a flag run is never
     compared against a name run. The name key stays as it always was. */
  const bestKey = d => 'wmg.best.' + d + (state.clue === 'flag' ? '.flag' : '');
  const clueLabel = () => state.clue === 'flag' ? 'Flag clue' : 'Name clue';

  /* The round prompt: either the country's name, or its flag. */
  function renderPrompt(key) {
    const m = META[key];
    const flagClue = state.clue === 'flag';

    taskLabel.textContent = flagClue
      ? 'Find the country with this flag'
      : 'Find this country';

    taskFlag.hidden = !flagClue;
    if (flagClue) {
      taskFlagImg.src = flagUrl(m.c);
      taskFlagImg.alt = 'Flag to identify';
    }

    // in flag mode the name is the answer, so it stays hidden until you answer
    taskName.textContent = flagClue ? '' : m.n;
    taskZh.textContent   = flagClue ? '' : m.zh;
  }

  /* Once a flag round is answered, put the name back so you actually learn it. */
  function revealAnswerName(answer) {
    if (state.clue !== 'flag' || !answer) return;
    taskName.textContent = answer.n;
    taskZh.textContent   = answer.zh;
  }

  /* ── Map setup ───────────────────────────────────────── */
  const svg = d3.select(svgEl);
  let W = 0, H = 0;
  let projection, geoPath;
  let gRoot, zoomLayer, zoomBehavior;
  let nodeByKey = new Map();

  function updateProjection() {
    const r = mapWrap.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width));
    H = Math.max(220, Math.round(r.height));

    svg.attr('viewBox', `0 0 ${W} ${H}`);

    // Equirectangular: the whole world is 2π × π in projected units.
    const s = Math.min(W / (2 * Math.PI), H / Math.PI) * 0.985;
    projection = d3.geoEquirectangular()
      .scale(s)
      .translate([W / 2, H / 2])
      .precision(0.5);

    geoPath = d3.geoPath(projection);
  }

  function buildScene() {
    svg.selectAll('*').remove();
    nodeByKey = new Map();

    gRoot = svg.append('g').attr('class', 'root');

    gRoot.append('path')
      .datum({ type: 'Sphere' })
      .attr('class', 'sphere')
      .attr('d', d => geoPath(d));

    gRoot.append('path')
      .datum(d3.geoGraticule10())
      .attr('class', 'graticule')
      .attr('d', d => geoPath(d));

    zoomLayer = gRoot.append('g').attr('class', 'zoom-layer');

    const paths = zoomLayer.selectAll('path.country')
      .data(FEATURES, d => d.__key)
      .join('path')
      .attr('class', 'country')
      .attr('data-k', d => d.__key)
      .attr('d', d => geoPath(d));

    paths.each(function (d) { nodeByKey.set(d.__key, this); });

    paths
      .on('pointerenter', (e, d) => setHover(d.__key, true))
      .on('pointerleave', (e, d) => setHover(d.__key, false))
      .on('click', (e, d) => { if (wasDrag(e)) return; onPick(d.__key); });

    // zoom / pan
    zoomBehavior = d3.zoom()
      .scaleExtent([1, 14])
      .extent([[0, 0], [W, H]])
      .translateExtent([[0, 0], [W, H]])
      .on('start', () => svgEl.classList.add('grabbing'))
      .on('end',   () => svgEl.classList.remove('grabbing'))
      .on('zoom',  ev => gRoot.attr('transform', ev.transform));

    svg.call(zoomBehavior).on('dblclick.zoom', null);
  }

  function redraw() {
    gRoot.select('.sphere').attr('d', d => geoPath(d));
    gRoot.select('.graticule').attr('d', d => geoPath(d));
    zoomLayer.selectAll('path.country').attr('d', d => geoPath(d));
    svg.call(zoomBehavior.extent([[0, 0], [W, H]]).translateExtent([[0, 0], [W, H]]));
  }

  // suppress click when the user was panning
  let pointerDown = null;
  svgEl.addEventListener('pointerdown', e => { pointerDown = [e.clientX, e.clientY]; });
  function wasDrag(e) {
    if (!pointerDown) return false;
    const d = Math.hypot(e.clientX - pointerDown[0], e.clientY - pointerDown[1]);
    pointerDown = null;
    return d > 5;
  }

  /* ── Hover / flag panel ──────────────────────────────── */
  function setHover(key, entering) {
    if (state.pinned && !entering) return;

    const node = nodeByKey.get(key);
    if (node) node.classList.toggle('is-hovered', entering);

    if (entering) {
      state.hovered = key;
      hoverDot.classList.add('live');
      flagHead.textContent = state.mode === 'learn' ? 'Preview' : 'Under the cursor';
      renderFlagCard(key);
    } else {
      hoverDot.classList.remove('live');
      flagHead.textContent = 'Last hovered';
      // in learn mode, leaving a country restores the pinned selection
      if (state.mode === 'learn' && selectedKey) {
        flagHead.textContent = 'Selected';
        renderFlagCard(selectedKey);
      }
    }
  }

  function renderFlagCard(key) {
    const m = META[key];
    if (!m) return;

    if (m.c) {
      flagImg.src = flagUrl(m.c);
      flagImg.alt = m.n + ' flag';
      flagImg.hidden = false;
      flagEmpty.hidden = true;
    } else {
      flagImg.hidden = true;
      flagEmpty.hidden = false;
      flagEmpty.className = 'flag-empty none';
      flagEmpty.innerHTML = '<span>No flag available</span>';
    }

    // During a scored round the name can be masked so the flag alone is the clue.
    const showName = state.namesOnHover || !state.running;
    flagNameEn.textContent = showName ? m.n : '???';
    flagNameZh.textContent = showName ? m.zh : '';
    flagMeta.textContent = showName
      ? [m.r || null, fmtArea(m.a)].filter(Boolean).join(' · ')
      : '';

    renderFacts(key, showName);
  }

  /* The study card: everything worth memorising about a country. */
  function renderFacts(key, showName) {
    const m = META[key];
    if (state.mode !== 'learn' || !showName || !m) { flagFacts.hidden = true; return; }

    const rows = [
      ['Continent', m.ct + (m.ctz && m.ctz !== m.ct ? '  ·  ' + m.ctz : '')],
      ['Capital',   m.cap || '—'],
      ['Subregion', m.sub || '—'],
      ['Area',      fmtArea(m.a)],
      ['Languages', m.lang || '—'],
      ['Currency',  m.cur || '—'],
      ['Borders',   m.bord > 0
                      ? `${m.bord} land ${m.bord === 1 ? 'neighbour' : 'neighbours'}`
                      : 'none — island nation']
    ];

    flagFacts.innerHTML = rows
      .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`)
      .join('');
    flagFacts.hidden = false;
  }

  /* ── Game flow ───────────────────────────────────────── */
  function buildPool() {
    const min = DIFF[state.difficulty].minArea;
    return Object.keys(META).filter(k => {
      const m = META[k];
      if (!m.f) return false;          // no flag on file -> not a valid target
      if (m.c === 'aq') return false;  // Antarctica
      return m.a >= min;
    });
  }

  function clearFeedback() {
    zoomLayer.selectAll('path.country')
      .classed('is-correct', false)
      .classed('is-wrong', false)
      .classed('is-reveal', false)
      .classed('is-dim', false);
  }

  function setTaskButtons(enabled) {
    $('btnHint').disabled = !enabled;
    $('btnSkip').disabled = !enabled;
  }

  function startGame() {
    const pool = buildPool();
    if (pool.length < 4) { alert('Not enough countries for this difficulty.'); return; }

    setUiMode('game');
    state.running = true;
    state.pool = pool;
    state.queue = shuffle(pool.slice());
    state.round = 0;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.correct = 0;
    state.wrong = 0;
    state.missed = [];
    state.locked = false;
    state.target = null;
    state.pinned = null;

    clearFeedback();
    zoomLayer.selectAll('path.country').classed('is-pinned', false);
    resetView(0);
    logEl.innerHTML = '';
    updateStats();
    hideOverlay();
    nextRound();
  }

  function startLearn() {
    setUiMode('learn');

    state.running = false;
    state.locked = true;
    state.target = null;
    state.pinned = null;
    selectedKey = null;
    learnFilter.continent = 'all';
    learnFilter.query = '';
    learnSearch.value = '';

    clearFeedback();
    zoomLayer.selectAll('path.country').classed('is-pinned', false);
    taskName.textContent = 'Study mode';
    taskZh.textContent = '点地图上的国家，或从右侧列表选择';
    taskHint.textContent = '';
    setTaskButtons(false);

    renderLearnChips();
    renderLearnList();
    applyLearnDim();
    hideOverlay();
    resetView(0);
    updateStats();

    const first = learnCountries()[0];
    if (first) selectCountry(first, false);
  }

  function setUiMode(mode) {
    state.mode = mode;
    const learn = mode === 'learn';
    document.querySelector('.app').classList.toggle('mode-learn', learn);
    learnCard.hidden = !learn;
    flagFacts.hidden = !learn;
    $('btnMode').textContent = learn ? '🎮 Play game' : '📚 Learn mode';
    document.querySelector('.brand h1').textContent = learn ? 'Learn the World' : 'Guess the Country';
    document.querySelector('.brand p').textContent = learn
      ? 'Click a country to study it — or search the list'
      : 'Hover any country to see its flag on the right';

    if (!learn && zoomLayer) {
      // leaving study mode clears its highlighting
      selectedKey = null;
      zoomLayer.selectAll('path.country')
        .classed('is-dim', false)
        .classed('is-pinned', false);
    }
  }

  /* ── Learn mode helpers ──────────────────────────────── */
  function learnCountries() {
    const q = learnFilter.query.trim().toLowerCase();
    return Object.keys(META).filter(k => {
      const m = META[k];
      if (learnFilter.continent !== 'all' && m.k !== learnFilter.continent) return false;
      if (!q) return true;
      return m.n.toLowerCase().includes(q)
          || m.zh.includes(q)
          || (m.cap || '').toLowerCase().includes(q);
    }).sort((a, b) => META[a].n.localeCompare(META[b].n));
  }

  function renderLearnChips() {
    const counts = {};
    Object.keys(META).forEach(k => {
      const c = META[k].k;
      counts[c] = (counts[c] || 0) + 1;
    });

    learnChips.innerHTML = CONTINENTS
      .filter(c => c === 'all' || counts[c])
      .map(c => {
        const n = c === 'all' ? Object.keys(META).length : counts[c];
        return `<button class="chip ${learnFilter.continent === c ? 'on' : ''}" data-v="${c}">`
             + `${c === 'all' ? 'All' : c}<small>${n}</small></button>`;
      })
      .join('');
  }

  function renderLearnList() {
    const keys = learnCountries();
    learnCount.textContent = keys.length;

    const frag = document.createDocumentFragment();
    keys.forEach(k => {
      const m = META[k];
      const li = document.createElement('li');
      li.dataset.k = k;
      if (k === selectedKey) li.classList.add('on');

      if (m.c) {
        const img = document.createElement('img');
        img.src = flagUrl(m.c);
        img.alt = '';
        img.loading = 'lazy';
        li.appendChild(img);
      } else {
        const s = document.createElement('span');
        s.className = 'no-flag';
        s.textContent = '🏳';
        li.appendChild(s);
      }

      const wrap = document.createElement('div');
      wrap.className = 'lw';
      const en = document.createElement('span');
      en.className = 'ln';
      en.textContent = m.n;
      const zh = document.createElement('span');
      zh.className = 'lz';
      zh.textContent = m.zh;
      wrap.append(en, zh);

      const code = document.createElement('span');
      code.className = 'lc';
      code.textContent = CT_SHORT[m.k] || '';

      li.append(wrap, code);
      li.addEventListener('click', () => selectCountry(k, true));
      frag.appendChild(li);
    });

    learnList.innerHTML = '';
    learnList.appendChild(frag);
  }

  function applyLearnDim() {
    const c = learnFilter.continent;
    zoomLayer.selectAll('path.country').each(function (d) {
      const m = META[d.__key];
      this.classList.toggle('is-dim', c !== 'all' && (!m || m.k !== c));
    });
  }

  function selectCountry(key, fly) {
    selectedKey = key;
    zoomLayer.selectAll('path.country').classed('is-pinned', false);
    const node = nodeByKey.get(key);
    if (node) node.classList.add('is-pinned');

    learnList.querySelectorAll('li').forEach(li => {
      const on = li.dataset.k === key;
      li.classList.toggle('on', on);
      if (on) li.scrollIntoView({ block: 'nearest' });
    });

    hoverDot.classList.add('live');
    flagHead.textContent = 'Selected';
    renderFlagCard(key);
    if (fly) zoomToFeature(key);
  }

  /* Frame a single country, the way a map app would. */
  function zoomToFeature(key, dur = 700) {
    const feat = FEATURES.find(f => f.__key === key);
    if (!feat) return;
    const [[x0, y0], [x1, y1]] = geoPath.bounds(feat);
    const dx = x1 - x0, dy = y1 - y0;
    if (!(dx > 0) || !(dy > 0)) return;

    const k = Math.max(1, Math.min(9, 0.8 / Math.max(dx / W, dy / H)));
    const t = d3.zoomIdentity
      .translate(W / 2, H / 2)
      .scale(k)
      .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);

    svg.transition().duration(dur).call(zoomBehavior.transform, t);
  }

  learnChips.addEventListener('click', e => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    learnFilter.continent = btn.dataset.v;
    renderLearnChips();
    renderLearnList();
    applyLearnDim();
  });

  learnSearch.addEventListener('input', () => {
    learnFilter.query = learnSearch.value;
    renderLearnList();
  });

  $('btnRandomCountry').addEventListener('click', () => {
    const keys = learnCountries();
    if (!keys.length) return;
    const k = keys[Math.floor(Math.random() * keys.length)];
    selectCountry(k, true);
    const li = learnList.querySelector(`li[data-k="${k}"]`);
    if (li) li.scrollIntoView({ block: 'center' });
  });

  $('btnMode').addEventListener('click', () => {
    if (state.mode === 'learn') {
      setUiMode('game');
      showStartScreen();      // also resets the task card
    } else {
      startLearn();
    }
  });

  function nextRound() {
    if (state.rounds > 0 && state.round >= state.rounds) return endGame();

    state.round++;
    state.locked = false;
    state.hinted = false;
    clearFeedback();
    zoomLayer.selectAll('path.country').classed('is-pinned', false);

    if (!state.queue.length) state.queue = shuffle(state.pool.slice());
    let key = state.queue.pop();
    if (state.queue.length && key === state.target) {
      state.queue.unshift(key);
      key = state.queue.pop();
    }
    state.target = key;
    state.roundStart = performance.now();

    renderPrompt(key);
    taskHint.textContent = '';
    setTaskButtons(true);

    updateStats();
  }

  function onPick(key) {
    if (state.mode === 'learn') {
      selectCountry(key, false);
      return;
    }

    if (!state.running || state.locked || !state.target) return;
    state.locked = true;
    setTaskButtons(false);

    const targetKey = state.target;
    const picked = META[key];
    const answer = META[targetKey];

    if (key === targetKey) {
      const n = nodeByKey.get(key);
      if (n) n.classList.add('is-correct');

      const secs = (performance.now() - state.roundStart) / 1000;
      const speed = Math.max(0, Math.round(60 - secs * 5));
      const streakBonus = state.streak * 10;
      const gain = Math.max(20, 100 + streakBonus + speed);

      state.score += gain;
      state.streak++;
      state.correct++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);

      toast('ok', `Correct!  ${answer.n}  +${gain}`, answer.c);
      pushLog(targetKey, true, '+' + gain);
      revealAnswerName(answer);
      updateStats();
      setTimeout(nextRound, 850);
    } else {
      const wn = nodeByKey.get(key);
      if (wn) wn.classList.add('is-wrong');
      const tn = nodeByKey.get(targetKey);
      if (tn) tn.classList.add('is-reveal');

      state.streak = 0;
      state.wrong++;
      state.missed.push(targetKey);

      toast('no', `${picked ? picked.n : 'That'} — it was ${answer.n}`, answer.c);
      pushLog(targetKey, false, 'missed');
      revealAnswerName(answer);
      updateStats();
      setTimeout(nextRound, 1800);
    }
  }

  function endGame() {
    state.running = false;
    state.locked = true;
    state.target = null;

    const answered = state.correct + state.wrong;
    const acc = answered ? Math.round(state.correct / answered * 100) : 0;

    taskName.textContent = 'Round complete';
    taskZh.textContent = `${state.correct} / ${answered} correct`;
    taskHint.textContent = 'See the summary on the map';
    setTaskButtons(false);
    const key = bestKey(state.difficulty);
    const prevBest = Number(localStorage.getItem(key) || 0);
    const isBest = state.score > prevBest;
    if (isBest) localStorage.setItem(key, String(state.score));

    const medal = acc >= 90 ? '🥇' : acc >= 70 ? '🥈' : acc >= 50 ? '🥉' : '🎯';

    const missedHTML = state.missed.length
      ? `<div class="missed">
           <h4>Countries you missed (${state.missed.length})</h4>
           <ul>${state.missed.map(k => {
             const m = META[k];
             const f = m.c ? `<img src="${flagUrl(m.c)}" alt="">` : '';
             return `<li>${f}${m.n} <span style="color:var(--ink-3);font-weight:500">${m.zh}</span></li>`;
           }).join('')}</ul>
         </div>`
      : `<p class="result-line">Flawless run — no misses at all. 🎉</p>`;

    showOverlay(`
      <div class="result-score">${state.score.toLocaleString()}</div>
      <div class="result-line">
        ${medal} ${state.correct}/${answered} correct · ${acc}% accuracy · best streak ${state.bestStreak}
        <br><span style="color:var(--ink-3)">${clueLabel()} · ${DIFF[state.difficulty].label} difficulty</span>
        ${isBest ? '<br><strong style="color:var(--ok)">New personal best!</strong>' : ''}
      </div>
      ${missedHTML}
      <button class="btn wide" id="btnAgain">Play again</button>
      <button class="btn ghost wide" id="btnSettings">Change settings</button>
    `);

    $('btnAgain').addEventListener('click', startGame);
    $('btnSettings').addEventListener('click', showStartScreen);
  }

  function pushLog(key, ok, tag) {
    const m = META[key];
    const li = document.createElement('li');
    li.className = ok ? 'ok' : 'no';
    li.appendChild(flagImgEl(m.c));
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = m.n;
    const tg = document.createElement('span');
    tg.className = 'tag';
    tg.textContent = tag;
    li.append(nm, tg);
    logEl.prepend(li);
    while (logEl.children.length > 40) logEl.lastElementChild.remove();
    logCount.textContent = state.correct + state.wrong;
  }

  function updateStats() {
    $('statScore').textContent = state.score.toLocaleString();
    $('statRound').textContent = state.rounds > 0
      ? `${state.round}/${state.rounds}`
      : String(state.round);
    $('statStreak').textContent = state.streak;
    const answered = state.correct + state.wrong;
    $('statAcc').textContent = answered ? Math.round(state.correct / answered * 100) + '%' : '–';
  }

  /* ── Toast ───────────────────────────────────────────── */
  let toastTimer = null;
  function toast(kind, text, flagCode) {
    toastEl.className = 'toast show ' + kind;
    toastEl.innerHTML = '';
    if (flagCode) toastEl.appendChild(flagImgEl(flagCode));
    const s = document.createElement('span');
    s.textContent = text;
    toastEl.appendChild(s);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), kind === 'no' ? 2000 : 1300);
  }

  /* ── Overlay screens ─────────────────────────────────── */
  function showOverlay(html) {
    overlayPanel.innerHTML = html;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  function showStartScreen() {
    const counts = {
      easy: buildPoolFor('easy').length,
      normal: buildPoolFor('normal').length,
      hard: buildPoolFor('hard').length
    };
    const best = Number(localStorage.getItem(bestKey(state.difficulty)) || 0);
    const flagClue = state.clue === 'flag';

    // put the task card back to its idle state
    taskLabel.textContent = 'Find this country';
    taskFlag.hidden = true;
    taskName.textContent = 'Press Start';
    taskZh.textContent = '';
    taskHint.textContent = '';
    setTaskButtons(false);

    showOverlay(`
      <h2>🌍 Guess the Country</h2>
      <p class="sub">
        ${flagClue
          ? 'A <b>flag</b> appears on the right. Click the country it belongs to.<br>'
          : 'A <b>country name</b> appears on the right. Find it on the map and click it.<br>'}
        Hover any country to see its flag in the flag panel.
      </p>

      <div class="opt-row">
        <label>Clue</label>
        <div class="chips" id="chipsClue">
          <button class="chip ${flagClue?'':'on'}" data-v="name">Country name<small>find it on the map</small></button>
          <button class="chip ${flagClue?'on':''}" data-v="flag">Flag<small>which country is this?</small></button>
        </div>
      </div>

      <div class="opt-row">
        <label>Stuck? Watch an ad for a hint</label>
        <div class="hint-note">
          The 💡 <b>Hint</b> button plays a 15-second ad, then shows which continent the
          country is on and fades every other continent out of the map. Closing the ad
          early gives you nothing, and you get one hint per round.
        </div>
      </div>

      <div class="opt-row">
        <label>Difficulty</label>
        <div class="chips" id="chipsDiff">
          <button class="chip ${state.difficulty==='easy'?'on':''}"   data-v="easy">Easy<small>${counts.easy} large countries</small></button>
          <button class="chip ${state.difficulty==='normal'?'on':''}" data-v="normal">Normal<small>${counts.normal} countries</small></button>
          <button class="chip ${state.difficulty==='hard'?'on':''}"   data-v="hard">Hard<small>${counts.hard} countries</small></button>
        </div>
      </div>

      <div class="opt-row">
        <label>Rounds</label>
        <div class="chips" id="chipsRounds">
          <button class="chip ${state.rounds===10?'on':''}" data-v="10">10</button>
          <button class="chip ${state.rounds===20?'on':''}" data-v="20">20</button>
          <button class="chip ${state.rounds===50?'on':''}" data-v="50">50</button>
          <button class="chip ${state.rounds===0?'on':''}"  data-v="0">Endless</button>
        </div>
      </div>

      <div class="opt-row">
        <label>Country names while hovering</label>
        <div class="chips" id="chipsNames">
          <button class="chip ${state.namesOnHover?'on':''}" data-v="1">Show<small>relaxed</small></button>
          <button class="chip ${!state.namesOnHover?'on':''}" data-v="0">Hide<small>real challenge</small></button>
        </div>
        ${flagClue && state.namesOnHover
          ? `<div class="hint-note" style="margin-top:7px">With names shown, hovering a country tells you
             which one you are on — the flag clue becomes a lot easier. Pick <b>Hide</b> for a real test.</div>`
          : ''}
      </div>

      <button class="btn wide" id="btnStart">Start playing</button>
      <button class="btn ghost wide" id="btnLearn">📚 Learn mode — study the map &amp; flags</button>
      <div class="best">Personal best (${DIFF[state.difficulty].label} · ${clueLabel().toLowerCase()}): <strong>${best.toLocaleString()}</strong></div>
    `);

    chipGroup('chipsClue', v => {
      state.clue = v;
      // sensible default per clue: flag rounds start without the name giveaway
      state.namesOnHover = v !== 'flag';
      showStartScreen();
    });
    chipGroup('chipsDiff',   v => { state.difficulty = v; showStartScreen(); });
    chipGroup('chipsRounds', v => { state.rounds = Number(v); showStartScreen(); });
    chipGroup('chipsNames',  v => { state.namesOnHover = v === '1'; showStartScreen(); });

    $('btnStart').addEventListener('click', startGame);
    $('btnLearn').addEventListener('click', startLearn);
  }

  function chipGroup(id, onPick) {
    const box = $(id);
    if (!box) return;
    box.addEventListener('click', e => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      onPick(btn.dataset.v);
    });
  }

  function buildPoolFor(diff) {
    const min = DIFF[diff].minArea;
    return Object.keys(META).filter(k => {
      const m = META[k];
      return m.f && m.c !== 'aq' && m.a >= min;
    });
  }

  /* ── Controls ────────────────────────────────────────── */
  function resetView(dur) {
    if (!zoomBehavior) return;
    const sel = dur ? svg.transition().duration(dur) : svg;
    sel.call(zoomBehavior.transform, d3.zoomIdentity);
  }
  $('btnZoomIn').addEventListener('click', () => svg.transition().duration(250).call(zoomBehavior.scaleBy, 1.6));
  $('btnZoomOut').addEventListener('click', () => svg.transition().duration(250).call(zoomBehavior.scaleBy, 1 / 1.6));
  $('btnZoomReset').addEventListener('click', () => resetView(400));

  /* ── Ads ─────────────────────────────────────────────────
     One of these is picked at random each time the hint is used.
     Add an entry here and a matching .ad-<id> theme in styles.css. */
  const ADS = [
    {
      id: 'arcade',
      url: 'https://williamweiyangwu.github.io/games/',
      title: "Arcade — William's Games",
      body: 'Five games, one place, all running in your browser. WWII card battles in <b>KARDS</b>, ' +
            'grand strategy in <b>Europe 1939</b>, voxel building in <b>Blockcraft</b>, ' +
            'arena combat in <b>Tank War</b>, and drifting in <b>Apex Racing</b>.',
      cta: 'Open the arcade ↗',
      art: ['♠', '⚑', '▢', '⛌', '⚙']
    },
    {
      id: 'casamio',
      url: 'https://casamio3d.com/',
      title: 'Casamio 3D — Virtual home tours',
      body: 'Walk through a listing before you ever drive over. Immersive <b>3D tours</b>, ' +
            '<b>360°</b> views, floor plans, video and street view for real-estate listings — ' +
            'plus before/after comparisons for flipped homes.',
      cta: 'Browse 3D listings ↗',
      art: ['⌂', '⟳', '▦', '▶', '⛶']
    }
  ];

  let lastAdId = null;

  function pickAd() {
    // random, but never the same ad twice in a row
    const pool = ADS.filter(a => a.id !== lastAdId);
    const from = pool.length ? pool : ADS;
    const ad = from[Math.floor(Math.random() * from.length)];
    lastAdId = ad.id;
    return ad;
  }

  function renderAd(ad) {
    adCreative.href = ad.url;
    adCreative.className = 'ad-creative ad-' + ad.id;
    adCreative.innerHTML =
      '<div class="ad-art" aria-hidden="true">' +
        ad.art.map((g, i) => `<span class="t${i + 1}">${g}</span>`).join('') +
      '</div>' +
      '<div class="ad-copy">' +
        `<h3>${ad.title}</h3>` +
        `<p>${ad.body}</p>` +
        `<span class="ad-cta">${ad.cta}</span>` +
      '</div>';
  }

  /* ── Ad-gated hint ───────────────────────────────────── */
  let adTimer = null, adStartedAt = 0, adFinished = false;

  function openAd() {
    if (!state.running || state.locked || !state.target || state.hinted) return;

    renderAd(pickAd());

    adFinished = false;
    adStartedAt = performance.now();
    adBar.style.width = '0%';
    adStatus.textContent = `Hint unlocks in ${AD_SECONDS}s`;
    adClaim.disabled = true;
    adClaim.textContent = 'Reveal continent';
    adClaim.classList.remove('pulse');
    adOverlay.hidden = false;
    tickAd();
    adTimer = setInterval(tickAd, 100);
  }

  function tickAd() {
    const elapsed = (performance.now() - adStartedAt) / 1000;
    const left = Math.max(0, AD_SECONDS - elapsed);

    adBar.style.width = Math.min(100, (elapsed / AD_SECONDS) * 100) + '%';

    if (left <= 0) {
      if (adTimer) clearInterval(adTimer);
      adTimer = null;
      adFinished = true;
      adBar.style.width = '100%';
      adStatus.textContent = 'Hint unlocked — thanks for watching!';
      adClaim.disabled = false;
      adClaim.classList.add('pulse');
      return;
    }

    adStatus.textContent = `Hint unlocks in ${Math.ceil(left)}s`;
  }

  function closeAd() {
    if (adTimer) clearInterval(adTimer);
    adTimer = null;
    adOverlay.hidden = true;
    adClaim.classList.remove('pulse');
    // time spent on the ad must not count against the round's speed bonus
    state.roundStart += performance.now() - adStartedAt;
  }

  function claimHint() {
    if (!adFinished) return;         // ad must have run its full length
    closeAd();
    applyHint();
  }

  function applyHint() {
    if (!state.running || !state.target || state.hinted) return;
    state.hinted = true;

    const target = META[state.target];
    taskHint.textContent = `Hint: ${target.ct} · ${target.ctz}`;
    $('btnHint').disabled = true;   // one hint per round

    // narrow the map down to that continent
    zoomLayer.selectAll('path.country').each(function (d) {
      const m = META[d.__key];
      this.classList.toggle('is-dim', !m || m.k !== target.k);
    });
  }

  $('btnHint').addEventListener('click', openAd);
  $('btnSkip').addEventListener('click', () => {
    if (!state.running || state.locked || !state.target) return;
    const targetKey = state.target;
    state.locked = true;
    setTaskButtons(false);
    const n = nodeByKey.get(targetKey);
    if (n) n.classList.add('is-reveal');
    state.streak = 0;
    state.wrong++;
    state.missed.push(targetKey);
    toast('info', `Skipped — it was ${META[targetKey].n}`, META[targetKey].c);
    pushLog(targetKey, false, 'skipped');
    revealAnswerName(META[targetKey]);
    updateStats();
    setTimeout(nextRound, 1600);
  });

  $('adCancel').addEventListener('click', closeAd);
  $('adClaim').addEventListener('click', claimHint);
  adOverlay.addEventListener('click', e => { if (e.target === adOverlay) closeAd(); });

  document.addEventListener('keydown', e => {
    if (!adOverlay.hidden) {
      if (e.key === 'Escape') closeAd();
      return;
    }
    if (e.key === 'Escape') { resetView(350); }
    if (e.key === '+' || e.key === '=') $('btnZoomIn').click();
    if (e.key === '-') $('btnZoomOut').click();
  });

  /* ── Preload flags ───────────────────────────────────── */
  function preloadFlags() {
    Object.keys(META).forEach(k => {
      const c = META[k].c;
      if (!c) return;
      const img = new Image();
      img.src = flagUrl(c);
    });
  }

  /* ── Resize ──────────────────────────────────────────── */
  let rzTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => { updateProjection(); redraw(); }, 120);
  });

  /* ── Boot ────────────────────────────────────────────── */
  updateProjection();
  buildScene();
  preloadFlags();
  setUiMode('game');
  showStartScreen();

  // expose for console tinkering
  window.WMG = {
    state, META, FEATURES,
    projection: () => projection,
    bestKey, clueLabel,
    ads: { list: ADS, pick: pickAd, last: () => lastAdId, setLast: v => { lastAdId = v; } }
  };
})();
