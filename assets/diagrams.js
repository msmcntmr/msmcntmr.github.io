/* ====================================================================
   vuotogeometrico — mermaid diagrams
   Loaded (as a module) only on articles containing ```mermaid blocks.
   Colours come from the live palette tokens (--bg/--panel/--ink/--mute/
   --line set by shared.js), and diagrams re-render when the palette or
   typeface changes from the tweaks panel.
   ==================================================================== */
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';

const blocks = [...document.querySelectorAll('pre.mermaid')].map(el => ({ el, src: el.textContent }));

function token(name, fallback){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function themeVariables(){
  const bg = token('--bg', '#ece6dc');
  const panel = token('--panel', '#ffffff');
  const ink = token('--ink', '#1a1410');
  const mute = token('--mute', '#9c9489');
  const line = token('--line', '#d8d0c2');
  return {
    fontFamily: token('--sans', 'Helvetica, sans-serif'),
    fontSize: '14px',
    background: panel,
    primaryColor: bg,
    primaryTextColor: ink,
    primaryBorderColor: mute,
    secondaryColor: panel,
    tertiaryColor: panel,
    lineColor: mute,
    textColor: ink,
    mainBkg: bg,
    nodeBorder: mute,
    clusterBkg: panel,
    clusterBorder: line,
    titleColor: ink,
    edgeLabelBackground: panel,
    noteBkgColor: bg,
    noteTextColor: ink,
    noteBorderColor: line
  };
}

const phone = window.matchMedia('(max-width: 640px)');
let seq = 0;
let lastKey = '';
async function renderAll(){
  const vars = themeVariables();
  const key = JSON.stringify(vars);
  if (key === lastKey) return;
  lastKey = key;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: vars,
    securityLevel: 'strict',
    // compact spacing: the article column is narrow, so every pixel of
    // layout width costs legibility once the SVG is scaled to fit
    flowchart: { nodeSpacing: 16, rankSpacing: 40, padding: 12, diagramPadding: 8,
                 subGraphTitleMargin: { top: 4, bottom: 10 } }
  });
  for (const b of blocks){
    try {
      const { svg } = await mermaid.render(`mmd-${seq++}`, b.src);
      b.el.innerHTML = svg;
      // don't shrink past the point where labels stop being readable
      // (80%, or 65% on phones); a wider diagram scrolls sideways instead
      const el = b.el.querySelector('svg');
      const natural = el && el.viewBox.baseVal && el.viewBox.baseVal.width;
      if (natural) el.style.minWidth = Math.round(natural * (phone.matches ? 0.65 : 0.8)) + 'px';
      b.el.setAttribute('data-rendered', '');
    } catch (e) {
      console.warn('mermaid: could not render diagram', e);
      b.el.textContent = b.src;
      b.el.removeAttribute('data-rendered');
    }
  }
}

if (blocks.length){
  await renderAll();
  phone.addEventListener('change', () => { lastKey = ''; renderAll(); });
  // shared.js writes palette/typeface tokens onto <html style>; follow them
  let t;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(renderAll, 150); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
}
