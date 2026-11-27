/* ---------- falling-code backdrop (software-engineering articles) ----------
   Columns of mirrored half-width katakana and digits falling down the top half
   of the right pane, each with a brighter leading glyph and a fading trail
   whose glyphs flicker now and then. Page ink at low strength, faded towards
   the middle of the pane by a CSS mask (templates/article.html). Static under
   reduced motion; paused while the tab is hidden. */
(() => {
  const canvas = document.querySelector('.right > .rain');
  if (!canvas) return;
  const pane = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const wide = matchMedia('(min-width: 1025px)');
  // on the home page the backdrop animates only while shown (class "on")
  // (it keeps running while the panes swap: assets/shared.css lifts it into its own
  // transition layer, so it does not force the sweep to re-capture the page)
  const live = () => !canvas.hasAttribute('data-gated') || canvas.classList.contains('on');

  const COL = 9, ROW = 14;          // column spacing and row height, px
  const FONT = 12;                  // glyph size, px (up to ~7.4px wide)
  const A = { head: 0.32, trail: 0.16 };
  const GLYPHS = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ012345789Z:.=*+-<>¦|';
  const pick = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

  let w = 0, h = 0, dpr = 1, ink = '0,0,0', cols = [], rows = 0, raf = 0, last = 0;

  function readInk(){
    const c = getComputedStyle(canvas).color.match(/[\d.]+/g) || [0, 0, 0];
    ink = c.slice(0, 3).join(',');
  }
  const rgba = a => `rgba(${ink},${a})`;

  // a drop: head row (fractional), speed in rows/s, trail length in rows
  function drop(col, first){
    col.y = first ? -Math.random() * rows * 1.5 : -Math.random() * rows * 0.6;
    col.speed = 5 + Math.random() * 9;
    col.trail = 8 + Math.floor(Math.random() * 18);
    // still frame (reduced motion): drops already spread over the area
    if (first && calm.matches) col.y = Math.random() * (rows + col.trail);
  }

  function setup(){
    if (!wide.matches) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(2, devicePixelRatio || 1);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    readInk();
    rows = Math.ceil(h / ROW) + 1;
    const n = Math.ceil(w / COL);
    cols = Array.from({ length: n }, () => {
      const col = { glyphs: Array.from({ length: rows }, pick) };
      drop(col, true);
      return col;
    });
    kick();
  }

  function draw(){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${FONT}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    cols.forEach((col, i) => {
      const head = Math.floor(col.y);
      for (let k = 0; k <= col.trail; k++){
        const row = head - k;
        if (row < 0 || row >= rows) continue;
        const a = k === 0 ? A.head : A.trail * (1 - k / (col.trail + 1));
        ctx.fillStyle = rgba(a);
        // mirrored, as in the film
        ctx.setTransform(-dpr, 0, 0, dpr, (i * COL + COL / 2) * dpr, (row * ROW + ROW / 2) * dpr);
        ctx.fillText(col.glyphs[row], 0, 0);
      }
    });
  }

  function frame(now){
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    if (!calm.matches){
      for (const col of cols){
        const before = Math.floor(col.y);
        col.y += col.speed * dt;
        // a new glyph appears under the head each time it moves down a row
        if (Math.floor(col.y) !== before && Math.floor(col.y) < rows && Math.floor(col.y) >= 0)
          col.glyphs[Math.floor(col.y)] = pick();
        if (col.y - col.trail > rows) drop(col, false);
        // the odd glyph in the trail flickers to another
        if (Math.random() < 0.04) col.glyphs[Math.floor(Math.random() * rows)] = pick();
      }
    }
    draw();
    if (!calm.matches && !document.hidden && live()) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  new ResizeObserver(setup).observe(pane);
  new MutationObserver(kick).observe(canvas, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(readInk).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  calm.addEventListener('change', kick);
  wide.addEventListener('change', setup);
})();
