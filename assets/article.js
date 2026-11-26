/* ====================================================================
   slowforward — article runtime
   Static pages are pre-rendered at build time; this wires up the
   interactive layer: footnote ↔ sidenote hover linking, the fullscreen
   image modal, and pan-to-explore. Ported from the design renderer.
   ==================================================================== */

(() => {
  const $body = document.getElementById('body');
  if (!$body) return;

  /* ----- footnote hover linking (both directions) ----- */
  const sidenoteRefs = {};
  $body.querySelectorAll('.sidenote[data-fn]').forEach(el => {
    sidenoteRefs[el.dataset.fn] = el;
  });

  $body.querySelectorAll('sup.fn-ref a').forEach(a => {
    const n = a.dataset.fn;
    a.addEventListener('mouseenter', () => {
      const note = sidenoteRefs[n];
      if (note) note.classList.add('is-hover');
      a.classList.add('is-hover');
    });
    a.addEventListener('mouseleave', () => {
      const note = sidenoteRefs[n];
      if (note) note.classList.remove('is-hover');
      a.classList.remove('is-hover');
    });
  });

  /* ----- sidenote collision avoidance (two-column layout only) ----- */
  const notes = Object.values(sidenoteRefs);
  const wide = window.matchMedia('(min-width: 1101px)');
  function layoutSidenotes(){
    let prevBottom = -Infinity;
    for (const note of notes){
      note.style.top = '';
      if (!wide.matches) continue;
      const top = note.getBoundingClientRect().top + window.scrollY;
      const shift = Math.max(0, prevBottom + 20 - top);
      if (shift) note.style.top = shift + 'px';
      prevBottom = top + shift + note.scrollHeight;
    }
  }
  if (notes.length){
    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layoutSidenotes); };
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);              // images settle
    document.fonts && document.fonts.ready.then(schedule);  // web fonts reflow
    // text-size / typeface tweaks rewrite tokens on <html style>
    new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  }

  /* ----- reading rail: on-screen window + chapter marks in the right margin -----
     Shown only on articles with chapters (h2). The ink segment maps the
     viewport onto the rail; its two ends follow on springs, the leading end
     stiffer than the trailing one, so the segment stretches while scrolling
     and settles with a small bounce. The current chapter's title stays beside
     its tick; pointing near the rail lists every chapter. */
  const seam = document.querySelector('[data-seam]');
  const heads = [...$body.querySelectorAll(':scope > h2')];
  if (seam && !heads.length) seam.remove();
  else if (seam){
    const twoCol = window.matchMedia('(min-width: 1025px)');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ticksEl = seam.querySelector('.seam-ticks');
    let ticks = [], raf = 0, last = 0, current = -1;

    // hover strip around the rail; the list stays open while the pointer is
    // on the strip or on a title, with a short grace period between them
    const zone = document.createElement('div');
    zone.className = 'seam-zone';
    seam.insertBefore(zone, ticksEl);
    let closeT = 0;
    seam.addEventListener('mouseenter', () => { clearTimeout(closeT); seam.classList.add('open'); });
    seam.addEventListener('mouseleave', () => {
      clearTimeout(closeT);
      closeT = setTimeout(() => { seam.classList.remove('open'); kick(); }, 220);
    });
    const docH = () => Math.max(1, document.documentElement.scrollHeight);
    const maxScroll = () => Math.max(1, docH() - innerHeight);
    // where a jumped-to chapter heading lands, and where it counts as reached
    const landing = () => Math.round(innerHeight * 0.08);
    const headY = h => h.getBoundingClientRect().top + scrollY - landing();

    // the rail sits past the article's right edge (text + sidenote column),
    // never closer than 24px to the pane boundary
    function placeRail(){
      const body = $body.getBoundingClientRect().right;
      const pane = $body.closest('.pane').getBoundingClientRect().right;
      const x = Math.round(Math.min(body + 40, pane - 24));
      seam.style.setProperty('--seam-x', x + 'px');
      // room between the text column and the rail for the current title
      // (labels end 20px left of the rail); too little room and it stays hidden
      const p = $body.querySelector(':scope > p');
      const room = Math.floor(x - 20 - 16 - (p ? p.getBoundingClientRect().right : body));
      seam.style.setProperty('--seam-room', Math.max(0, room) + 'px');
      seam.classList.toggle('cramped', room < 120);
    }

    function placeTicks(){
      placeRail();
      ticksEl.textContent = '';
      ticks = heads.map(h => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'seam-tick'; b.tabIndex = -1;
        b.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = h.textContent;
        b.append(label);
        b.addEventListener('click', () => scrollTo({ top: headY(h), behavior: calm.matches ? 'auto' : 'smooth' }));
        ticksEl.append(b);
        // scroll progress at which the chapter counts as reached
        const reach = Math.min(1, Math.max(0, headY(h) / maxScroll()));
        return { b, h, reach };
      });
      placeTickMarks();
      kick();
    }
    // a tick sits where its heading falls on the rail (same mapping as the
    // window); titles that would touch (a wrapped title is two lines tall)
    // are pushed down to stay legible
    function placeTickMarks(){
      const run = innerHeight - 64, cut = 6;            // cut: half-gap in the rail
      let prevY = -Infinity, prevH = 0;
      const stops = ['#000 0'];
      for (const t of ticks){
        const at = (t.h.getBoundingClientRect().top + scrollY) / docH();
        t.b.style.setProperty('--at', at.toFixed(4));
        const h = t.b.querySelector('span').offsetHeight;
        const y = 32 + run * at, shown = Math.max(y, prevY + (prevH + h) / 2 + 2);
        t.b.style.setProperty('--dy', (shown - y).toFixed(1) + 'px');
        prevY = shown; prevH = h;
        stops.push(`#000 ${(y - cut).toFixed(1)}px`, `transparent ${(y - cut).toFixed(1)}px`,
                   `transparent ${(y + cut).toFixed(1)}px`, `#000 ${(y + cut).toFixed(1)}px`);
      }
      seam.style.setProperty('--gaps', `linear-gradient(to bottom, ${stops.join(', ')})`);
    }

    // spring state for the two ends of the segment (fractions of the rail)
    const ends = { a: { x: 0, v: 0 }, b: { x: 0, v: 0 } };
    const LEAD = { k: 380, c: 26 }, TRAIL = { k: 70, c: 8 };
    function step(e, target, lead, dt){
      const { k, c } = lead ? LEAD : TRAIL;
      e.v += (k * (target - e.x) - c * e.v) * dt;
      e.x += e.v * dt;
    }
    function frame(now){
      raf = 0;
      const dt = Math.min(0.032, last ? (now - last) / 1000 : 0.016);
      last = now;
      const ta = scrollY / docH(), tb = (scrollY + innerHeight) / docH();
      if (calm.matches){
        ends.a.x = ta; ends.b.x = tb; ends.a.v = ends.b.v = 0;
      } else {
        const down = (ta - ends.a.x) + (tb - ends.b.x) >= 0;
        for (let i = 0; i < 2; i++){                   // two half-steps: steadier
          step(ends.a, ta, !down, dt / 2);
          step(ends.b, tb, down, dt / 2);
        }
      }
      const a = Math.max(0, Math.min(ends.a.x, ends.b.x - 0.004));
      const b = Math.min(1, Math.max(ends.b.x, a + 0.004));
      seam.style.setProperty('--a', a.toFixed(5));
      seam.style.setProperty('--b', b.toFixed(5));
      const p = scrollY / maxScroll();
      current = -1;
      ticks.forEach((t, i) => {
        const passed = p >= t.reach - 0.001;
        t.b.classList.toggle('passed', passed);
        if (passed) current = i;
      });
      ticks.forEach((t, i) => t.b.classList.toggle('current', i === current));
      const busy = Math.abs(ends.a.x - ta) + Math.abs(ends.b.x - tb) > 1e-4
        || Math.abs(ends.a.v) + Math.abs(ends.b.v) > 1e-3;
      if (busy) raf = requestAnimationFrame(frame); else last = 0;
    }
    function kick(){ if (!raf) raf = requestAnimationFrame(frame); }

    function setup(){
      if (!twoCol.matches) return;
      placeTicks();
      if (!seam.classList.contains('on')){                 // first show: no spring-in
        ends.a.x = scrollY / docH(); ends.b.x = (scrollY + innerHeight) / docH();
      }
      seam.classList.add('on');
    }
    setup();
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', setup);
    addEventListener('load', setup);
    document.fonts && document.fonts.ready.then(setup);
    twoCol.addEventListener('change', setup);
    new MutationObserver(setup).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    // diagrams render and images settle after load: re-measure when the article's height changes
    let rT = 0;
    new ResizeObserver(() => { clearTimeout(rT); rT = setTimeout(setup, 100); }).observe($body);
  }

  Object.entries(sidenoteRefs).forEach(([n, aside]) => {
    const enter = () => {
      $body.querySelectorAll(`.sent[data-fns~="${n}"]`).forEach(s => s.classList.add('is-hover-sent'));
      $body.querySelectorAll(`sup.fn-ref a[data-fn="${n}"]`).forEach(a => a.classList.add('is-hover'));
      aside.classList.add('is-hover');
    };
    const leave = () => {
      $body.querySelectorAll('.sent.is-hover-sent').forEach(s => s.classList.remove('is-hover-sent'));
      $body.querySelectorAll(`sup.fn-ref a[data-fn="${n}"]`).forEach(a => a.classList.remove('is-hover'));
      aside.classList.remove('is-hover');
    };
    aside.addEventListener('mouseenter', enter);
    aside.addEventListener('mouseleave', leave);
  });

  /* ============== MODAL ============== */
  const figsEl = document.getElementById('figdata');
  const figs = figsEl ? JSON.parse(figsEl.textContent || '[]') : [];

  const modal = document.getElementById('modal');
  const mImg = document.getElementById('modal-img');
  const mTitle = document.getElementById('m-title');
  const mCaption = document.getElementById('m-caption');
  const mDesc = document.getElementById('m-desc');
  const mTech = document.getElementById('m-tech');
  if (!modal) return;

  function toneColor(tone){
    switch(tone){
      case 'warm': return 'color-mix(in oklab, var(--bg) 60%, #c8a98a 40%)';
      case 'cool': return 'color-mix(in oklab, var(--bg) 60%, #98a6b1 40%)';
      case 'sage': return 'color-mix(in oklab, var(--bg) 60%, #9aa893 40%)';
      case 'blush': return 'color-mix(in oklab, var(--bg) 60%, #c6a39d 40%)';
      default: return 'color-mix(in oklab, var(--bg) 70%, var(--ink) 8%)';
    }
  }

  function openModal(it){
    mImg.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'ph';
    if (it.tone) wrap.style.setProperty('--tone', toneColor(it.tone));
    if (it.src && it.img){
      const sizes = 'min(861px, 58vw)';
      const srcset = (tmpl) => it.img.widths.map(w => `${tmpl.replace('{w}', w)} ${w}w`).join(', ');
      const picture = document.createElement('picture');
      const avifSource = document.createElement('source');
      avifSource.type = 'image/avif';
      avifSource.srcset = srcset(it.img.avif);
      avifSource.sizes = sizes;
      const webpSource = document.createElement('source');
      webpSource.type = 'image/webp';
      webpSource.srcset = srcset(it.img.webp);
      webpSource.sizes = sizes;
      const img = document.createElement('img');
      img.src = it.src;
      img.srcset = srcset(it.img.fallback);
      img.sizes = sizes;
      img.alt = it.title || '';
      picture.appendChild(avifSource);
      picture.appendChild(webpSource);
      picture.appendChild(img);
      wrap.appendChild(picture);
      attachPan(img);
    } else if (it.src){
      const img = document.createElement('img');
      img.src = it.src;
      img.alt = it.title || '';
      wrap.appendChild(img);
      attachPan(img);
    } else {
      wrap.classList.add('placeholder');
      const lab = document.createElement('span');
      lab.className = 'ph-label';
      lab.textContent = (it.title || 'photograph');
      wrap.appendChild(lab);
    }
    mImg.appendChild(wrap);

    mTitle.textContent = it.title || 'Untitled';
    if (it.caption){ mCaption.textContent = it.caption; mCaption.hidden = false; }
    else { mCaption.hidden = true; }
    if (it.description){
      mDesc.innerHTML = '';
      const paras = Array.isArray(it.description) ? it.description : [it.description];
      for (const p of paras){
        const el = document.createElement('p');
        el.innerHTML = p;
        mDesc.appendChild(el);
      }
      mDesc.hidden = false;
    }
    else { mDesc.hidden = true; mDesc.innerHTML = ''; }

    mTech.innerHTML = '';
    const tech = it.tech || {};
    const entries = Object.entries(tech);
    if (entries.length){
      for (const [k, v] of entries){
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        mTech.appendChild(dt); mTech.appendChild(dd);
      }
      mTech.style.display = '';
    } else {
      mTech.style.display = 'none';
    }

    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('open'));
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
  }
  function closeModal(){
    if (mImg.classList.contains('panning')) exitPan();
    modal.classList.remove('open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { modal.hidden = true; }, 400);
  }
  function onKey(e){
    if (e.key === 'Escape'){
      if (mImg.classList.contains('panning')){ exitPan(); return; }
      closeModal();
    }
  }

  /* ---- pan-to-explore: click image to fill frame & pan with cursor ---- */
  let panImg = null;
  let panRAF = 0;
  let panTargetX = 50, panTargetY = 50;
  let panCurX = 50, panCurY = 50;
  const panCursor = document.createElement('div');
  panCursor.className = 'pan-cursor';
  const panHint = document.createElement('div');
  panHint.className = 'pan-hint';
  panHint.textContent = 'Click to explore';

  function attachPan(img){
    if (!mImg.contains(panHint)) mImg.appendChild(panHint);
    if (!mImg.contains(panCursor)) mImg.appendChild(panCursor);
    panImg = img;
    img.addEventListener('load', () => {
      const r = mImg.getBoundingClientRect();
      const fits = Math.abs((img.naturalWidth / img.naturalHeight) - (r.width / r.height)) < 0.02;
      panHint.style.display = fits ? 'none' : '';
    }, { once: true });
    img.addEventListener('click', enterPan);
  }

  function enterPan(e){
    e.stopPropagation();
    if (!panImg) return;
    if (mImg.classList.contains('panning')){ exitPan(); return; }
    mImg.classList.add('panning');
    panHint.textContent = 'Move to pan · click to fit';
    panTargetX = panCurX = 50;
    panTargetY = panCurY = 50;
    mImg.addEventListener('mousemove', onPanMove);
    mImg.addEventListener('mouseleave', onPanLeave);
    panImg.addEventListener('click', exitPanFromClick);
    loopPan();
  }
  function onPanMove(e){
    const r = mImg.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    panTargetX = Math.max(0, Math.min(100, px * 100));
    panTargetY = Math.max(0, Math.min(100, py * 100));
    panCursor.style.left = (e.clientX - r.left) + 'px';
    panCursor.style.top  = (e.clientY - r.top) + 'px';
  }
  function onPanLeave(){
    panTargetX = 50;
    panTargetY = 50;
  }
  function exitPanFromClick(e){
    e.stopPropagation();
    exitPan();
  }
  function exitPan(){
    mImg.classList.remove('panning');
    panHint.textContent = 'Click to explore';
    mImg.removeEventListener('mousemove', onPanMove);
    mImg.removeEventListener('mouseleave', onPanLeave);
    if (panImg){
      panImg.removeEventListener('click', exitPanFromClick);
      panImg.style.objectPosition = '50% 50%';
    }
    cancelAnimationFrame(panRAF);
    panRAF = 0;
  }
  function loopPan(){
    if (!mImg.classList.contains('panning')) return;
    panCurX += (panTargetX - panCurX) * 0.18;
    panCurY += (panTargetY - panCurY) * 0.18;
    if (panImg) panImg.style.objectPosition = panCurX.toFixed(2) + '% ' + panCurY.toFixed(2) + '%';
    panRAF = requestAnimationFrame(loopPan);
  }

  modal.querySelector('.scrim').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (!e.target.closest('.modal-inner')) closeModal();
  });

  /* ----- wire pre-rendered figures to the modal ----- */
  $body.querySelectorAll('figure.photo[data-fig]').forEach(fig => {
    const it = figs[+fig.dataset.fig];
    if (it) fig.addEventListener('click', () => openModal(it));
  });
})();
