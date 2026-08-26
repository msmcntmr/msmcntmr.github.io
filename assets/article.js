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
