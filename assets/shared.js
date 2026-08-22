/* ====================================================================
   slowforward — shared
   - Tweaks (typography, size, columns, palette)
   - Morphing mark (geometric shapes)
   - Smooth cross-page transitions (View Transitions + fade fallback)
   ==================================================================== */

(() => {
  /* ---------- tweak defaults (mirrored in EDITMODE block) ---------- */
  const DEFAULTS = {
    typeface: 'helvetica',
    titleface: 'match',   // article title font: 'match' uses body typeface, else see TITLE_FACES
    textSize: 14,
    leading: 1.55,
    columnRatio: 58,      // % width of left column
    bodyWidth: 48,        // ch — article text column width
    palette: 'warm-cream',// see PALETTES below
    scrim: 'dark',        // fullscreen image backdrop: 'dark' | 'light'
    hover: 'underline',   // entry hover style: 'underline' | 'arrow' | 'italic' | 'marker'
    panels: 'normal'      // pane background arrangement: 'normal' | 'swapped'
  };

  const PALETTES = {
    'cool-gray':  { bg:'#ededed', panel:'#ffffff', ink:'#111111', mute:'#9a9a9a', line:'#d8d8d8' },
    'warm-cream': { bg:'#ece6dc', panel:'#ffffff', ink:'#1a1410', mute:'#9c9489', line:'#d8d0c2' },
    'sage':       { bg:'#dde2db', panel:'#ffffff', ink:'#161a14', mute:'#8a9285', line:'#cdd3c6' },
    'paper':      { bg:'#e8e1d3', panel:'#ffffff', ink:'#1c1812', mute:'#9c9485', line:'#d4ccba' },
    'mist':       { bg:'#dde1e5', panel:'#ffffff', ink:'#10131a', mute:'#878d96', line:'#c8cdd3' }
  };

  const TYPEFACES = {
    helvetica:  { stack:'"Helvetica Neue", Helvetica, "Arial Nova", sans-serif', label:'Helvetica' },
    geist:      { stack:'"Geist", "Helvetica Neue", Helvetica, sans-serif', label:'Geist', google:'Geist:wght@300..600' },
    funnel:     { stack:'"Funnel Sans", "Helvetica Neue", Helvetica, sans-serif', label:'Funnel Sans', google:'Funnel+Sans:wght@300..600' },
    onest:      { stack:'"Onest", "Helvetica Neue", Helvetica, sans-serif', label:'Onest', google:'Onest:wght@300..600' }
  };

  // Display faces for the article title only. 'match' falls back to body typeface.
  const TITLE_FACES = {
    match:      { stack:'inherit', label:'Match body' },
    instrument: { stack:'"Instrument Serif", "EB Garamond", Georgia, serif', label:'Instrument Serif', google:'Instrument+Serif:ital@0;1' },
    newsreader: { stack:'"Newsreader", "Newsreader Display", Georgia, serif', label:'Newsreader', google:'Newsreader:opsz,wght@6..72,300..600' },
    bricolage:  { stack:'"Bricolage Grotesque", "Helvetica Neue", Helvetica, sans-serif', label:'Bricolage', google:'Bricolage+Grotesque:opsz,wght@12..96,400..700' },
    ebgaramond: { stack:'"EB Garamond", Georgia, serif', label:'EB Garamond', google:'EB+Garamond:wght@400..600' },
    grotesk:    { stack:'"Space Grotesk", "Helvetica Neue", Helvetica, sans-serif', label:'Space Grotesk', google:'Space+Grotesk:wght@400..600' },
    syne:       { stack:'"Syne", "Helvetica Neue", Helvetica, sans-serif', label:'Syne', google:'Syne:wght@500..700' }
  };

  /* ---------- load/save ---------- */
  const STORAGE = 'slowforward.tweaks.v1';
  function loadTweaks(){
    const fromHost = (typeof window !== 'undefined' && window.__SF_DEFAULTS) || {};
    try{ return { ...DEFAULTS, ...fromHost, ...JSON.parse(localStorage.getItem(STORAGE) || '{}') }; }
    catch(e){ return { ...DEFAULTS, ...fromHost }; }
  }
  function saveTweaks(t){
    localStorage.setItem(STORAGE, JSON.stringify(t));
  }

  /* ---------- apply ---------- */
  const loadedFonts = new Set();
  function loadGoogleFont(name){
    const f = TYPEFACES[name];
    if (!f || !f.google || loadedFonts.has('body:'+name)) return;
    loadedFonts.add('body:'+name);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
    document.head.appendChild(link);
  }
  function loadTitleFont(name){
    const f = TITLE_FACES[name];
    if (!f || !f.google || loadedFonts.has('title:'+name)) return;
    loadedFonts.add('title:'+name);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
    document.head.appendChild(link);
  }

  function applyTweaks(t){
    const root = document.documentElement.style;
    const p = PALETTES[t.palette] || PALETTES['warm-cream'];
    root.setProperty('--bg',    p.bg);
    root.setProperty('--panel', p.panel);
    root.setProperty('--ink',   p.ink);
    root.setProperty('--mute',  p.mute);
    root.setProperty('--line',  p.line);

    const tf = TYPEFACES[t.typeface] || TYPEFACES.helvetica;
    if (tf.google) loadGoogleFont(t.typeface);
    root.setProperty('--sans', tf.stack);

    const tt = TITLE_FACES[t.titleface] || TITLE_FACES.match;
    if (tt.google) loadTitleFont(t.titleface);
    // 'inherit' means take the body --sans; otherwise use the display stack.
    root.setProperty('--title-font', tt.stack === 'inherit' ? tf.stack : tt.stack);
    // expose key so per-face nudges (italic, weight, tracking) can hook in CSS
    if (document.body) document.body.dataset.titleface = t.titleface || 'match';

    root.setProperty('--fs',  t.textSize + 'px');
    root.setProperty('--lh',  t.leading);
    root.setProperty('--col-l', t.columnRatio + 'fr');
    root.setProperty('--col-r', (100 - t.columnRatio) + 'fr');
    root.setProperty('--body-ch', t.bodyWidth + 'ch');

    // Fullscreen modal backdrop
    if (t.scrim === 'light'){
      root.setProperty('--scrim-bg',  'rgba(255,255,255,0.72)');
      root.setProperty('--scrim-ink', p.ink);
    } else {
      root.setProperty('--scrim-bg',  'rgba(0,0,0,0.72)');
      root.setProperty('--scrim-ink', '#ffffff');
    }

    // Hover style — expose on <body> for CSS hooks
    if (document.body) document.body.dataset.hover = t.hover || 'underline';

    // Panel background swap
    if (document.body) document.body.dataset.panels = t.panels || 'normal';
    if (t.panels === 'swapped'){
      root.setProperty('--pane-left-bg',  'var(--panel)');
      root.setProperty('--pane-right-bg', 'var(--bg)');
    } else {
      root.setProperty('--pane-left-bg',  'var(--bg)');
      root.setProperty('--pane-right-bg', 'var(--panel)');
    }
  }

  /* ---------- init early ---------- */
  let state = loadTweaks();
  applyTweaks(state);

  // expose for the panel
  window.__sf = {
    get state(){ return state; },
    set(partial){
      state = { ...state, ...partial };
      saveTweaks(state);
      applyTweaks(state);
      // notify listeners (text-size picker, etc)
      try{ document.dispatchEvent(new CustomEvent('sf:tweak-changed', { detail: partial })); }catch(e){}
      // try to persist into the EDITMODE block too
      try{
        window.parent.postMessage({ type: '__edit_mode_set_keys', edits: partial }, '*');
      }catch(e){}
    },
    reset(){
      state = { ...DEFAULTS };
      saveTweaks(state);
      applyTweaks(state);
    },
    PALETTES, TYPEFACES, TITLE_FACES, DEFAULTS
  };

  /* ====================================================================
     TWEAKS PANEL
     ==================================================================== */
  let panel = null;
  let panelOpen = false;

  function buildPanel(){
    const el = document.createElement('div');
    el.className = 'sf-tweaks';
    el.innerHTML = `
      <header>
        <strong>Tweaks</strong>
        <button class="x" aria-label="Close">×</button>
      </header>
      <div class="body">
        <section>
          <label>Typeface</label>
          <div class="radio" data-key="typeface">
            ${Object.entries(TYPEFACES).map(([k,v]) =>
              `<button data-val="${k}" style="font-family:${v.stack.replace(/"/g,'&quot;')}">${v.label}</button>`
            ).join('')}
          </div>
        </section>

        <section>
          <label>Article title</label>
          <div class="radio titleface" data-key="titleface">
            ${Object.entries(TITLE_FACES).map(([k,v]) => {
              const stack = v.stack === 'inherit' ? '' : `font-family:${v.stack.replace(/"/g,'&quot;')};`;
              const italic = k === 'instrument' ? 'font-style:italic;' : '';
              return `<button data-val="${k}" style="${stack}${italic}">${v.label}</button>`;
            }).join('')}
          </div>
        </section>

        <section>
          <label>Text size <span class="v" data-out="textSize">14</span><span class="u">px</span></label>
          <input type="range" min="12" max="20" step="1" data-key="textSize" />
        </section>

        <section>
          <label>Leading <span class="v" data-out="leading">1.55</span></label>
          <input type="range" min="1.3" max="1.9" step="0.05" data-key="leading" />
        </section>

        <section>
          <label>Column ratio <span class="v" data-out="columnRatio">58</span><span class="u">%</span></label>
          <input type="range" min="40" max="72" step="1" data-key="columnRatio" />
        </section>

        <section>
          <label>Article width <span class="v" data-out="bodyWidth">48</span><span class="u">ch</span></label>
          <input type="range" min="36" max="72" step="1" data-key="bodyWidth" />
        </section>

        <section>
          <label>Palette</label>
          <div class="swatches" data-key="palette">
            ${Object.entries(PALETTES).map(([k,p]) =>
              `<button data-val="${k}" title="${k}">
                 <span class="sw" style="background:${p.bg}"></span>
                 <span class="sw" style="background:${p.panel}"></span>
                 <span class="sw ink" style="background:${p.ink}"></span>
               </button>`
            ).join('')}
          </div>
        </section>

        <section>
          <label>Image backdrop</label>
          <div class="radio" data-key="scrim">
            <button data-val="dark">Dark</button>
            <button data-val="light">Light</button>
          </div>
        </section>

        <section>
          <label>Entry hover</label>
          <div class="radio" data-key="hover">
            <button data-val="underline">Underline</button>
            <button data-val="arrow">Arrow</button>
            <button data-val="italic">Italic</button>
            <button data-val="marker">Marker</button>
          </div>
        </section>

        <section>
          <label>Panels</label>
          <div class="radio" data-key="panels">
            <button data-val="normal">Normal</button>
            <button data-val="swapped">Swapped</button>
          </div>
        </section>

        <section class="reset">
          <button class="reset-btn">Reset</button>
        </section>
      </div>
    `;

    // sync UI to state
    function sync(){
      el.querySelectorAll('input[type=range]').forEach(i => {
        i.value = state[i.dataset.key];
        const out = el.querySelector(`[data-out="${i.dataset.key}"]`);
        if (out) out.textContent = state[i.dataset.key];
      });
      el.querySelectorAll('.radio button, .swatches button').forEach(b => {
        const key = b.parentElement.dataset.key;
        b.classList.toggle('active', state[key] === b.dataset.val);
      });
    }

    // wire events
    el.addEventListener('input', e => {
      if (e.target.matches('input[type=range]')){
        const k = e.target.dataset.key;
        let v = e.target.value;
        if (k === 'leading') v = parseFloat(v); else v = +v;
        // round bodyWidth to integer
        if (k === 'bodyWidth') v = Math.round(v);
        window.__sf.set({ [k]: v });
        const out = el.querySelector(`[data-out="${k}"]`);
        if (out) out.textContent = v;
      }
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('x')){
        closePanel();
      } else if (b.classList.contains('reset-btn')){
        window.__sf.reset();
        sync();
      } else if (b.parentElement.dataset.key){
        const k = b.parentElement.dataset.key;
        window.__sf.set({ [k]: b.dataset.val });
        sync();
      }
    });

    sync();
    return el;
  }

  function openPanel(){
    if (!panel){
      panel = buildPanel();
      document.body.appendChild(panel);
    }
    requestAnimationFrame(() => panel.classList.add('open'));
    panelOpen = true;
  }
  function closePanel(){
    if (panel) panel.classList.remove('open');
    panelOpen = false;
    try{ window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); }catch(e){}
  }

  window.addEventListener('message', e => {
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === '__activate_edit_mode') openPanel();
    if (m.type === '__deactivate_edit_mode') closePanel();
  });

  // signal availability
  setTimeout(() => {
    try{ window.parent.postMessage({ type: '__edit_mode_available' }, '*'); }catch(e){}
  }, 50);


  /* ====================================================================
     MORPHING MARK
     A 3×3 grid of solid filled squares. Cycles between bold, deliberate
     glyph patterns (block, bar, cross, etc) by crossfading per-cell
     opacity. Pauses for several seconds at random.
     ==================================================================== */

  // smoothstep
  const ease = t => t * t * (3 - 2*t);

  // 9-cell patterns, row-major. 1 = filled, 0 = empty.
  const PATTERNS = [
    // solid block
    [1,1,1, 1,1,1, 1,1,1],
    // plus
    [0,1,0, 1,1,1, 0,1,0],
    // vertical bar
    [0,1,0, 0,1,0, 0,1,0],
    // horizontal bar
    [0,0,0, 1,1,1, 0,0,0],
    // I-beam
    [1,1,1, 0,1,0, 1,1,1],
    // H
    [1,0,1, 1,1,1, 1,0,1],
    // diagonal \
    [1,0,0, 0,1,0, 0,0,1],
    // diagonal /
    [0,0,1, 0,1,0, 1,0,0],
    // frame
    [1,1,1, 1,0,1, 1,1,1],
    // T
    [1,1,1, 0,1,0, 0,1,0],
    // ⊥
    [0,1,0, 0,1,0, 1,1,1],
    // left bar
    [1,0,0, 1,0,0, 1,0,0],
    // right bar
    [0,0,1, 0,0,1, 0,0,1],
    // top bar
    [1,1,1, 0,0,0, 0,0,0],
    // bottom bar
    [0,0,0, 0,0,0, 1,1,1],
    // single dot center
    [0,0,0, 0,1,0, 0,0,0],
    // L
    [1,0,0, 1,0,0, 1,1,1],
    // ⌐
    [1,1,1, 1,0,0, 1,0,0]
  ];

  function initMark(el){
    if (!el) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 10 10');
    svg.setAttribute('aria-hidden', 'true');

    // 3x3 grid of filled squares.
    const cell = 2.6;
    const gap  = 0.6;
    const start = (10 - (3 * cell + 2 * gap)) / 2;
    const rects = [];
    for (let i = 0; i < 9; i++){
      const r = Math.floor(i / 3);
      const c = i % 3;
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', (start + c * (cell + gap)).toFixed(3));
      rect.setAttribute('y', (start + r * (cell + gap)).toFixed(3));
      rect.setAttribute('width', cell);
      rect.setAttribute('height', cell);
      rect.setAttribute('fill', 'currentColor');
      rect.setAttribute('shape-rendering', 'crispEdges');
      svg.appendChild(rect);
      rects.push(rect);
    }
    el.appendChild(svg);

    // start state
    let curIdx  = 0;
    let nextIdx = 1;
    let cur  = PATTERNS[curIdx].slice();
    let next = PATTERNS[nextIdx].slice();
    let phaseStart = performance.now();
    let phase = 'morph';
    let morphDur = 700;
    let holdDur  = 1200;
    let pauseDur = 0;

    function pickNext(){
      let n;
      do { n = Math.floor(Math.random() * PATTERNS.length); } while (n === curIdx);
      return n;
    }

    function applyBlend(t){
      const e = ease(t);
      for (let i = 0; i < 9; i++){
        const v = cur[i] + (next[i] - cur[i]) * e;
        rects[i].setAttribute('opacity', v.toFixed(3));
      }
    }

    function tick(now){
      const elapsed = now - phaseStart;

      if (phase === 'morph'){
        const t = Math.min(1, elapsed / morphDur);
        applyBlend(t);
        if (t >= 1){
          cur = next.slice();
          curIdx = nextIdx;
          phaseStart = now;
          if (Math.random() < 0.4){
            phase = 'pause';
            pauseDur = 2600 + Math.random() * 4200; // 2.6–6.8s long hold
          } else {
            phase = 'hold';
            holdDur = 500 + Math.random() * 700;
          }
        }
      } else if (phase === 'hold' || phase === 'pause'){
        const need = phase === 'hold' ? holdDur : pauseDur;
        if (elapsed >= need){
          nextIdx = pickNext();
          next = PATTERNS[nextIdx].slice();
          morphDur = 500 + Math.random() * 500;
          phaseStart = now;
          phase = 'morph';
        }
      }
      requestAnimationFrame(tick);
    }

    // initial state on screen
    applyBlend(0);
    requestAnimationFrame(tick);
  }

  /* ====================================================================
     SMOOTH PAGE TRANSITIONS
     - On internal link click: fade body out, navigate (works everywhere)
     - View Transitions API kicks in automatically for same-document
       changes if used, and we declare cross-doc @view-transition in CSS
     ==================================================================== */
  function setupTransitions(){
    // Sustain the back/forward cache fade-in
    window.addEventListener('pageshow', (e) => {
      document.body.classList.remove('sf-leaving');
      document.body.classList.add('sf-entered');
    });

    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      // same page (just query change)? still do fade
      e.preventDefault();
      document.body.classList.add('sf-leaving');
      setTimeout(() => { location.href = a.href; }, 240);
    });

    // initial entrance
    requestAnimationFrame(() => {
      document.body.classList.add('sf-entered');
    });
  }

  /* ---------- DOM ready ---------- */
  function ready(fn){
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    // re-apply tweaks now that body exists (sets data-hover etc)
    applyTweaks(state);
    document.querySelectorAll('[data-mark]').forEach(initMark);
    document.querySelectorAll('[data-text-size]').forEach(initTextSize);
    document.querySelectorAll('[data-panel-swap]').forEach(initPanelSwap);
    setupTransitions();
  });

  /* ====================================================================
     TEXT-SIZE PICKER
     Wires any [data-text-size] container with child buttons
     [data-size="N"] (e.g. 16, 18, 20). Reflects + updates window.__sf.
     ==================================================================== */
  function initTextSize(root){
    const buttons = root.querySelectorAll('button[data-size]');
    function sync(){
      const cur = +window.__sf.state.textSize;
      buttons.forEach(b => b.classList.toggle('active', +b.dataset.size === cur));
    }
    buttons.forEach(b => {
      b.addEventListener('click', () => {
        const v = +b.dataset.size;
        window.__sf.set({ textSize: v });
        sync();
      });
    });
    sync();
    // poll for external changes (panel slider) cheaply
    window.addEventListener('storage', sync);
    document.addEventListener('sf:tweak-changed', sync);
  }

  function initPanelSwap(btn){
    btn.addEventListener('click', () => {
      const next = (window.__sf.state.panels === 'swapped') ? 'normal' : 'swapped';
      window.__sf.set({ panels: next });
    });
  }

})();
