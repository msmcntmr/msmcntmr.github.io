/* ---------- photography backdrop (photography articles) ----------
   The top half of the right pane as a view camera's ground glass with one of
   the article's photographs on it. Drawn in the page ink at low strength over
   the pane's own colour, and faded towards the middle of the pane by a CSS
   mask (templates/article.html). Layers, bottom to top:
     print  a random photograph of the article, upside down as on a real
            ground glass, as a faint two-tone print (darks in ink, lights left
            as the pane colour), washed out here and there by a light leak:
            soft patches drifting across it and, now and then, a flare from
            an edge
     glass  the etched grid and centre cross over fine Fresnel rings that
            slowly drift in and out of focus
     grain  film grain flickering like a projected print, with the odd dust
            speck and vertical hairline scratch
   An article without photographs gets the glass and the grain alone.
   Static under reduced motion; paused while the tab is hidden. */
(() => {
  const canvas = document.querySelector('.right > .photo');
  if (!canvas) return;
  const pane = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const wide = matchMedia('(min-width: 1025px)');
  const FPS = 30;

  let w = 0, h = 0, dpr = 1, ink = '0,0,0', raf = 0, last = 0, state = null;

  function readInk(){
    const c = getComputedStyle(canvas).color.match(/[\d.]+/g) || [0, 0, 0];
    ink = c.slice(0, 3).join(',');
  }
  const rgba = a => `rgba(${ink},${a})`;
  const rand = (a, b) => a + Math.random() * (b - a);
  const layer = (lw, lh) => { const c = document.createElement('canvas'); c.width = lw; c.height = lh; return c; };

  /* ---------------- grain ---------------- */
  const grain = {
    init(){
      // a handful of noise tiles at device resolution, cycled ~12 times a
      // second at random offsets: the grain "boils" like film without
      // generating a full frame of noise every frame
      const T = 256, [r, g, b] = ink.split(',').map(Number);
      const tiles = [];
      for (let k = 0; k < 6; k++){
        const c = layer(T, T), x = c.getContext('2d'), img = x.createImageData(T, T);
        for (let i = 0; i < T * T; i++){
          const v = Math.random();
          img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
          img.data[i * 4 + 3] = Math.round(255 * 0.16 * v * v * v);   // mostly faint, a few darker grains
        }
        x.putImageData(img, 0, 0);
        tiles.push(ctx.createPattern(c, 'repeat'));
      }
      return { tiles, tile: 0, ox: 0, oy: 0, nextFlick: 0, specks: [], scratches: [] };
    },
    draw(s, now){
      if (now >= s.nextFlick){
        s.tile = (s.tile + 1 + Math.floor(Math.random() * (s.tiles.length - 1))) % s.tiles.length;
        s.ox = Math.random() * 256; s.oy = Math.random() * 256;
        s.nextFlick = now + 80;
        // dust: a speck now and then, held for a moment
        if (Math.random() < 0.18) s.specks.push({ x: rand(0, w), y: rand(0, h), r: rand(0.5, 1.6), until: now + rand(150, 900), a: rand(0.12, 0.3) });
        // scratches: a vertical hairline that wavers for a second or two
        if (Math.random() < 0.012 && s.scratches.length < 2) s.scratches.push({ x: rand(0, w), until: now + rand(700, 2400), a: rand(0.06, 0.14) });
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(-s.ox, -s.oy);
      ctx.fillStyle = s.tiles[s.tile];
      ctx.fillRect(s.ox, s.oy, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.specks = s.specks.filter(p => p.until > now);
      for (const p of s.specks){
        ctx.fillStyle = rgba(p.a);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * rand(0.6, 1), 0, 0, Math.PI * 2); ctx.fill();
      }
      s.scratches = s.scratches.filter(p => p.until > now);
      for (const p of s.scratches){
        p.x += rand(-0.6, 0.6);
        ctx.strokeStyle = rgba(p.a); ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x + rand(-1, 1), h); ctx.stroke();
      }
    }
  };

  /* ---------------- ground glass ---------------- */
  const glass = {
    init(k){                                   // k: strength
      // the Fresnel rings, sharp and soft; the frame crossfades between them,
      // so the focus breathes without blurring every frame. Each set is one
      // radial gradient with a stop at every ring edge: a single fill,
      // instead of hundreds of circles to stroke
      const cx = w / 2, cy = h * 0.42, R = Math.hypot(w, h), P = 3.2;
      const ring = soft => {
        const c = layer(canvas.width, canvas.height), g = c.getContext('2d');
        g.scale(dpr, dpr);
        const half = (soft ? 0.8 : 0.3) / R, edge = (soft ? 1.2 : 0.25) / R;
        const a = rgba((soft ? 0.018 : 0.03) * k), clear = rgba(0);
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
        for (let r = 3; r < R - P; r += P){
          const m = r / R;
          gr.addColorStop(Math.max(0, m - half - edge), clear);
          gr.addColorStop(m - half, a); gr.addColorStop(m + half, a);
          gr.addColorStop(Math.min(1, m + half + edge), clear);
        }
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        return c;
      };
      const grid = layer(canvas.width, canvas.height), g = grid.getContext('2d');
      g.scale(dpr, dpr);
      g.strokeStyle = rgba(0.09 * k); g.lineWidth = 0.7;
      const step = Math.round(Math.min(w, h) / 6);
      g.beginPath();
      for (let x = cx % step; x < w; x += step){ g.moveTo(x, 0); g.lineTo(x, h); }
      for (let y = cy % step; y < h; y += step){ g.moveTo(0, y); g.lineTo(w, y); }
      g.stroke();
      g.strokeStyle = rgba(0.16 * k); g.lineWidth = 0.8;              // centre cross and circle
      g.beginPath(); g.moveTo(cx - 14, cy); g.lineTo(cx + 14, cy); g.moveTo(cx, cy - 14); g.lineTo(cx, cy + 14); g.stroke();
      g.beginPath(); g.arc(cx, cy, 30, 0, Math.PI * 2); g.stroke();
      return { sharp: ring(false), soft: ring(true), grid };
    },
    draw(s, now){
      const f = 0.5 + 0.5 * Math.sin(now / 1000 * (Math.PI * 2 / 9));   // a 9-second breath
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1 - f; ctx.drawImage(s.soft, 0, 0);
      ctx.globalAlpha = f;     ctx.drawImage(s.sharp, 0, 0);
      ctx.globalAlpha = 1;     ctx.drawImage(s.grid, 0, 0);
    }
  };

  /* ---------------- print ---------------- */
  // one of the article's photographs, picked at random on each visit and
  // loaded small (its 640px rendition)
  const photos = [...document.querySelectorAll('#body figure.photo img')];
  const photoEl = photos[Math.floor(Math.random() * photos.length)];
  const photoSrc = photoEl && ((photoEl.getAttribute('srcset') || '').split(',')[0].trim().split(' ')[0] || photoEl.getAttribute('src'));
  let photoImg = null;
  function withPhoto(cb){
    if (photoImg){ cb(photoImg); return; }
    const im = new Image();
    im.onload = () => { photoImg = im; cb(im); };
    im.src = photoSrc;
  }
  // luminance (0..1) of the photo covering a lw×lh area, rotated 180° as
  // the image lies on a view camera's ground glass
  function photoLum(im, lw, lh){
    const c = layer(lw, lh), g = c.getContext('2d');
    const s = Math.max(lw / im.width, lh / im.height);
    g.translate(lw, lh); g.rotate(Math.PI);
    g.drawImage(im, (lw - im.width * s) / 2, (lh - im.height * s) / 2, im.width * s, im.height * s);
    const d = g.getImageData(0, 0, lw, lh).data, lum = new Float32Array(lw * lh);
    for (let i = 0; i < lum.length; i++) lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    return lum;
  }
  // stretch a luminance map to its 2nd–98th percentile, so a dark or a pale
  // photograph ends up with the same range of tones
  function levels(lum){
    const sample = [];
    for (let i = 0; i < lum.length; i += 97) sample.push(lum[i]);
    sample.sort((a, b) => a - b);
    const lo = sample[Math.floor(sample.length * 0.02)], hi = sample[Math.floor(sample.length * 0.98)];
    const k = 1 / Math.max(0.05, hi - lo);
    for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) * k));
    return lum;
  }
  // the two-tone print: ink where the photograph is dark
  function inkLayer(lum, lw, lh, f){
    const c = layer(lw, lh), g = c.getContext('2d'), img = g.createImageData(lw, lh);
    const [r, gg, b] = ink.split(',').map(Number);
    for (let i = 0; i < lum.length; i++){
      img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(255 * f(1 - lum[i]));
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  const print = {
    init(){
      const s = { ready: false,
        blobs: Array.from({ length: 3 }, () => ({
          ax: rand(0.2, 0.8), ay: rand(0.2, 0.8), rx: rand(0.15, 0.3), ry: rand(0.1, 0.25),
          sx: rand(0.02, 0.045), sy: rand(0.015, 0.035), ph: rand(0, 6.3), r: rand(0.3, 0.5), a: rand(0.35, 0.6)
        })),
        flare: null, nextFlare: performance.now() + rand(2500, 6000) };
      if (photoSrc) withPhoto(im => {
        // worked at CSS-pixel size and drawn scaled up: the print is faint
        // and under grain, so full retina resolution would only cost time
        const lw = Math.round(w), lh = Math.round(h);
        s.print = inkLayer(levels(photoLum(im, lw, lh)), lw, lh, d => 0.11 * Math.pow(d, 1.15));
        s.off = layer(lw, lh);
        s.ready = true;
        kick();
      });
      return s;
    },
    draw(s, now){
      if (!s.ready) return;
      // the light leak washes the print out: ink is taken away where it falls
      const o = s.off.getContext('2d'), W = s.off.width, H = s.off.height, t = now / 1000, R = Math.max(W, H);
      o.globalCompositeOperation = 'source-over';
      o.clearRect(0, 0, W, H);
      o.drawImage(s.print, 0, 0);
      o.globalCompositeOperation = 'destination-out';
      for (const b of s.blobs){
        const x = W * (b.ax + b.rx * Math.sin(t * b.sx * 6.28 + b.ph));
        const y = H * (b.ay + b.ry * Math.cos(t * b.sy * 6.28 + b.ph * 1.3));
        const gr = o.createRadialGradient(x, y, 0, x, y, R * b.r);
        gr.addColorStop(0, `rgba(0,0,0,${b.a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        o.fillStyle = gr; o.fillRect(0, 0, W, H);
      }
      if (!s.flare && now >= s.nextFlare)
        s.flare = { side: Math.floor(rand(0, 4)), t0: now, dur: rand(2500, 4500), pos: rand(0.2, 0.8) };
      if (s.flare){
        const p = (now - s.flare.t0) / s.flare.dur;
        if (p >= 1){ s.flare = null; s.nextFlare = now + rand(6000, 13000); }
        else {
          const env = p < 0.25 ? p / 0.25 : Math.pow(1 - (p - 0.25) / 0.75, 2);
          const { side, pos } = s.flare;
          const [x0, y0] = side === 0 ? [0, H * pos] : side === 1 ? [W, H * pos] : side === 2 ? [W * pos, 0] : [W * pos, H];
          const gr = o.createRadialGradient(x0, y0, 0, x0, y0, R * 0.75);
          gr.addColorStop(0, `rgba(0,0,0,${0.9 * env})`); gr.addColorStop(0.5, `rgba(0,0,0,${0.4 * env})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
          o.fillStyle = gr; o.fillRect(0, 0, W, H);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(s.off, 0, 0, canvas.width, canvas.height);
    }
  };

  /* ---------------- frame loop ---------------- */
  function frame(now){
    raf = 0;
    if (last && now - last < 1000 / FPS - 2){ raf = requestAnimationFrame(frame); return; }
    last = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state){
      print.draw(state.print, now);
      glass.draw(state.glass, now);
      grain.draw(state.grain, now);
    }
    if (!calm.matches && !document.hidden) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  // rebuild only when something the drawing depends on has changed: the
  // canvas size, or the ink colour. Swapping the pane colours changes the
  // paper under the drawing, not the drawing, so it needs no rebuild.
  let built = '', pending = 0;
  function setup(){
    pending = 0;
    if (!wide.matches) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    readInk();
    const d = Math.min(2, devicePixelRatio || 1);
    const key = [Math.round(r.width), Math.round(r.height), d, ink].join('|');
    if (key === built) return;
    built = key;
    dpr = d;
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    // the glass drawn lighter than it would be alone, so the print stays the subject
    state = { print: print.init(), glass: glass.init(0.67), grain: grain.init() };
    last = 0;
    kick();
  }

  // bursts of changes (fonts and layout settling at load) make one rebuild
  const schedule = () => { if (!pending) pending = requestAnimationFrame(setup); };
  new ResizeObserver(schedule).observe(pane);
  // the reader can swap pane colours or change the palette
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  calm.addEventListener('change', kick);
  wide.addEventListener('change', schedule);
})();
