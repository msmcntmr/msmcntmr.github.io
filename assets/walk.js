/* ---------- random-walk backdrop (random articles) ----------
   A pen-plotter trace wandering over the top half of the right pane with no
   plan: it turns a little this way and that, steers away from the edges, and
   now and then lifts and sets down somewhere else. The oldest part of the
   trace fades as new trace is laid, so it never piles up. Page ink at low
   strength, faded towards the middle of the pane by a CSS mask
   (templates/article.html). Static under reduced motion; paused while the
   tab is hidden. */
(() => {
  const canvas = document.querySelector('.right > .walk');
  if (!canvas) return;
  const pane = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const wide = matchMedia('(min-width: 1025px)');
  // on the home page the backdrop animates only while shown (class "on")
  const live = () => !canvas.hasAttribute('data-gated') || canvas.classList.contains('on');
  const FPS = 30;

  const STEP = 1.5;         // px per simulated step
  const SPEED = 42;         // px per second
  const KEEP = 2600;        // steps of trace kept (~90 s)
  const BANDS = 24;         // alpha bands the trace is drawn in
  const A = { trace: 0.3, pen: 0.42 };
  const MARGIN = 26;
  const LIFT = 1 / 1400;    // chance per step that the pen lifts

  let w = 0, h = 0, dpr = 1, ink = '0,0,0', raf = 0, last = 0, carry = 0;
  let pts = [], pen = null;  // pts: {x, y} or null where the pen was lifted

  function readInk(){
    const c = getComputedStyle(canvas).color.match(/[\d.]+/g) || [0, 0, 0];
    ink = c.slice(0, 3).join(',');
  }
  const rgba = a => `rgba(${ink},${a})`;
  const rand = (a, b) => a + Math.random() * (b - a);

  function place(){
    pen = { x: rand(w * 0.2, w * 0.8), y: rand(h * 0.15, h * 0.6), a: rand(0, Math.PI * 2), turn: 0 };
  }

  function step(){
    if (Math.random() < LIFT){
      pts.push(null);
      place();
    }
    // the turn rate itself wanders, so the trace curls, straightens, curls back
    pen.turn = pen.turn * 0.985 + rand(-1, 1) * 0.012;
    pen.turn = Math.max(-0.11, Math.min(0.11, pen.turn));
    // near an edge, lean back towards the middle of the drawing area
    const near = pen.x < MARGIN || pen.x > w - MARGIN || pen.y < MARGIN || pen.y > h * 0.8 - MARGIN;
    if (near){
      const home = Math.atan2(h * 0.38 - pen.y, w * 0.5 - pen.x);
      let d = home - pen.a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      pen.a += Math.sign(d) * 0.06;
    }
    pen.a += pen.turn;
    pen.x += Math.cos(pen.a) * STEP;
    pen.y += Math.sin(pen.a) * STEP;
    pts.push({ x: pen.x, y: pen.y });
    if (pts.length > KEEP) pts.splice(0, pts.length - KEEP);
  }

  function draw(){
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 0.9;
    ctx.lineJoin = ctx.lineCap = 'round';
    const n = pts.length, per = Math.ceil(KEEP / BANDS);
    const off = KEEP - n;   // a young trace starts already bright
    for (let b = 0; b < BANDS; b++){
      const i0 = Math.max(0, b * per - off), i1 = Math.min(n - 1, (b + 1) * per - off);
      if (i1 <= i0) continue;
      const age = (b + 1) / BANDS;
      ctx.strokeStyle = rgba(A.trace * age * age);
      ctx.beginPath();
      let down = false;
      for (let i = i0; i <= i1; i++){
        const p = pts[i];
        if (!p){ down = false; continue; }
        if (down) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); down = true; }
      }
      ctx.stroke();
    }
    if (pen){
      ctx.fillStyle = rgba(A.pen);
      ctx.beginPath(); ctx.arc(pen.x, pen.y, 1.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  function frame(now){
    raf = 0;
    if (last && now - last < 1000 / FPS - 2){ raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    if (!calm.matches){
      carry += dt * SPEED / STEP;
      while (carry >= 1){ step(); carry -= 1; }
    }
    draw();
    if (!calm.matches && !document.hidden && live()) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  new MutationObserver(kick).observe(canvas, { attributes: true, attributeFilter: ['class'] });

  let pending = 0;
  function setup(){
    pending = 0;
    if (!wide.matches) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    readInk();
    dpr = Math.min(2, devicePixelRatio || 1);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    // start with some trace already laid, so the pane is never blank
    pts = []; place();
    for (let i = 0; i < KEEP * 0.6; i++) step();
    last = 0;
    kick();
  }

  const schedule = () => { if (!pending) pending = requestAnimationFrame(setup); };
  new ResizeObserver(schedule).observe(pane);
  new MutationObserver(() => { readInk(); kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  calm.addEventListener('change', kick);
  wide.addEventListener('change', schedule);
})();
