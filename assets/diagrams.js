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
  // the diagram sits on the article pane with no fill of its own; that pane is
  // --bg normally and --panel when the reader swaps panels (shared.js), so the
  // boxes take whichever of the two the pane is NOT, to stand out from it
  // (computed custom properties come back resolved, e.g. "#ffffff")
  const paneBg = token('--pane-left-bg', bg).toLowerCase();
  const swapped = paneBg === panel.toLowerCase() || paneBg.includes('--panel');
  const surface = swapped ? panel : bg;
  const box = swapped ? bg : panel;
  return {
    fontFamily: token('--sans', 'Helvetica, sans-serif'),
    fontSize: '14px',
    background: surface,
    primaryColor: box,
    primaryTextColor: ink,
    primaryBorderColor: mute,
    secondaryColor: box,
    tertiaryColor: surface,
    lineColor: mute,
    textColor: ink,
    mainBkg: box,
    nodeBorder: mute,
    clusterBkg: surface,
    clusterBorder: line,
    titleColor: ink,
    edgeLabelBackground: surface,
    noteBkgColor: box,
    noteTextColor: ink,
    noteBorderColor: line,
    // xychart-beta: muted bars, ink line, on the pane's own colour
    xyChart: {
      backgroundColor: surface,
      titleColor: ink,
      xAxisLabelColor: ink, xAxisTitleColor: mute, xAxisTickColor: mute, xAxisLineColor: mute,
      yAxisLabelColor: ink, yAxisTitleColor: mute, yAxisTickColor: mute, yAxisLineColor: mute,
      plotColorPalette: `${mute}, ${ink}`
    }
  };
}

// The site's diagram look, handed to mermaid as themeCSS so it is in place
// when mermaid measures labels (CSS added afterwards would clip them).
// Mermaid scopes every rule to the diagram's own id.
function modernCSS(){
  const bg = token('--bg', '#ece6dc');
  const panel = token('--panel', '#ffffff');
  const ink = token('--ink', '#1a1410');
  const mute = token('--mute', '#9c9489');
  const paneBg = token('--pane-left-bg', bg).toLowerCase();
  const swapped = paneBg === panel.toLowerCase() || paneBg.includes('--panel');
  const surface = swapped ? panel : bg;
  const box = swapped ? bg : panel;
  const mix = (a, pct, b) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;
  return `
    /* boxes: soft fill, hairline edge, rounded */
    .node rect, .node polygon, .node circle { rx: 8px; ry: 8px;
      fill: ${mix(box, 70, surface)} !important;
      stroke: ${mix(ink, 18, 'transparent')} !important; stroke-width: .75px !important; }
    .nodeLabel, .nodeLabel p { font-size: 13px; color: ${ink}; }
    /* groups: a faint tinted panel, no border, small spaced capitals */
    .cluster rect { rx: 14px; ry: 14px; stroke: none !important;
      fill: ${mix(ink, 4, 'transparent')} !important; }
    .cluster-label, .cluster-label span, .cluster-label p, .cluster-label .nodeLabel {
      font-size: 10.5px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase;
      color: ${mute} !important; fill: ${mute} !important; }
    /* connectors: thin, muted */
    .flowchart-link { stroke: ${mix(ink, 32, 'transparent')} !important; stroke-width: 1px !important; }
    marker path, .marker { fill: ${mix(ink, 45, 'transparent')} !important; stroke: none !important; }
    .edgeLabel, .edgeLabel p, .edgeLabel span { font-size: 11.5px; font-style: italic; color: ${mute} !important; }
    .edgeLabel rect, .labelBkg { fill: ${surface} !important; background: ${surface} !important; opacity: 1 !important; }
    /* xychart: lighter bars so the ink line reads first */
    [class^="bar-plot"] rect { fill: ${mix(mute, 45, surface)} !important; stroke: none !important; rx: 3px; ry: 3px; }
    [class^="line-plot"] path { stroke-width: 2px !important; stroke-linejoin: round; stroke-linecap: round; }
    .axis-line path, .axisl-line path, .ticks path { stroke: ${mix(ink, 25, 'transparent')} !important; stroke-width: 1px !important; }
    .chart-title text { font-size: 13px !important; fill: ${mute} !important; }
  `;
}

const phone = window.matchMedia('(max-width: 640px)');
let seq = 0;
let lastKey = '';
async function renderAll(){
  const vars = themeVariables();
  const themeCSS = modernCSS();
  const key = JSON.stringify(vars) + themeCSS;
  if (key === lastKey) return;
  lastKey = key;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: vars,
    themeCSS,
    securityLevel: 'strict',
    // compact spacing: the article column is narrow, so every pixel of
    // layout width costs legibility once the SVG is scaled to fit
    flowchart: { nodeSpacing: 16, rankSpacing: 40, padding: 14, diagramPadding: 8,
                 curve: 'basis',
                 subGraphTitleMargin: { top: 8, bottom: 12 } },
    // sized for the text column (~520px) so charts never need to scroll
    xyChart: { width: 520, height: 360, titlePadding: 8, titleFontSize: 15 }
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
