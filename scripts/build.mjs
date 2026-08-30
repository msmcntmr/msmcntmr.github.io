/* ====================================================================
   vuotogeometrico — static site generator

   Reads markdown articles from a content directory (the private repo)
   and renders the site into --out, reproducing the DOM the Claude
   Design mockup's runtime renderer produced.

   Usage: node scripts/build.mjs --content ../vuotogeometrico-content --out _site
   ==================================================================== */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import YAML from 'yaml';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';

const ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));

/* ---------------- args ---------------- */
const args = process.argv.slice(2);
function arg(name, dflt){
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const CONTENT = path.resolve(arg('content', '../vuotogeometrico-content'));
const OUT = path.resolve(arg('out', path.join(ROOT, '_site')));

if (!fs.existsSync(path.join(CONTENT, 'articles'))) {
  console.error(`No articles/ directory under ${CONTENT}`);
  process.exit(1);
}

/* ---------------- optional image processing ---------------- */
let sharp = null;
try { sharp = (await import('sharp')).default; }
catch { console.warn('sharp not installed — images copied without resize/EXIF-strip'); }

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff']);
const MAX_EDGE = 2200;
const WIDTH_LADDER = [640, 1024, 1600, 2200];

async function mapLimit(items, limit, fn){
  const ret = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length){ const idx = i++; ret[idx] = await fn(items[idx], idx); }
  }));
  return ret;
}

/* ---------------- site config ---------------- */
const SITE_DEFAULTS = {
  name: 'vuotogeometrico',
  role: '',
  about: [],
  email: '',
  url: '',
  description: '',
  tweaks: {
    typeface: 'geist',
    titleface: 'ebgaramond',
    textSize: 18,
    leading: 1.55,
    columnRatio: 57,
    bodyWidth: 72,
    palette: 'cool-gray',
    scrim: 'light',
    hover: 'underline',
    panels: 'normal'
  }
};
const siteFile = path.join(CONTENT, 'site.yml');
const siteCfg = fs.existsSync(siteFile) ? YAML.parse(fs.readFileSync(siteFile, 'utf8')) : {};
const SITE = {
  ...SITE_DEFAULTS,
  ...siteCfg,
  tweaks: { ...SITE_DEFAULTS.tweaks, ...(siteCfg.tweaks || {}) }
};

// canonical origin (e.g. https://msmcntmr.github.io or a custom domain) — absolute-URL
// tags/files (canonical, OG, sitemap, feed, JSON-LD, CNAME) are omitted when unset
const SITE_URL = String(SITE.url || '').replace(/\/+$/, '');
if (!SITE_URL){
  console.warn('⚠ site.yml has no "url:" set — canonical/OG/sitemap/robots/feed/JSON-LD will be omitted.');
}
function abs(pathname){ return SITE_URL ? SITE_URL + pathname : ''; }

/* ---------------- helpers ---------------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const escCode = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function fmtLong(d){ return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}, ${d.getUTCFullYear()}`; }
function fmtShort(d){ return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${String(d.getUTCDate()).padStart(2, '0')}`; }

/* ====================================================================
   code tokenizer — ported verbatim from the design renderer
   ==================================================================== */
const LANG_LABEL = { go:'Go', php:'PHP', js:'JavaScript', ts:'TypeScript', markdown:'Markdown', md:'Markdown', yaml:'YAML', sh:'Shell', shell:'Shell', html:'HTML', css:'CSS' };
const LANG_KW = {
  go:  /\b(func|package|import|var|const|type|struct|interface|return|if|else|for|range|switch|case|default|break|continue|go|chan|select|map|defer|fallthrough)\b/,
  php: /\b(function|class|public|private|protected|static|return|if|else|elseif|foreach|for|while|switch|case|new|use|namespace|echo|print|array)\b/,
  js:  /\b(function|var|let|const|return|if|else|for|while|switch|case|new|class|extends|import|export|from|default|async|await|typeof|of|in|do|try|catch|finally|throw)\b/,
  ts:  /\b(function|var|let|const|return|if|else|for|while|switch|case|new|class|extends|import|export|from|default|async|await|typeof|of|in|do|try|catch|finally|throw|interface|type|implements|public|private|protected|readonly)\b/,
  sh:  /\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|return|function|local|export|echo|cd|read)\b/,
  shell:/\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|return|function|local|export|echo|cd|read)\b/
};
const LANG_LIT = /\b(true|false|nil|null|undefined|None|True|False)\b/;
const LANG_TYPE = {
  go:  /\b(string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|error|any|interface\{\})\b/,
  php: /\b(DateTimeInterface|DateTime|self|static|int|string|bool|void|array|float|mixed|object)\b/,
  ts:  /\b(string|number|boolean|any|unknown|void|never|object)\b/
};

function tokenizeLine(line, lang){
  if (lang === 'markdown' || lang === 'md') return tokenizeMd(line);
  const escd = escCode(line);
  const parts = [
    `(?<c>\\/\\/[^\\n]*|#[^\\n]*)`,
    `(?<s>"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`[^\`]*\`)`,
    `(?<n>\\b\\d+(?:\\.\\d+)?\\b)`,
    `(?<v>\\$[A-Za-z_]\\w*)`,
  ];
  if (LANG_KW[lang])  parts.push(`(?<k>${LANG_KW[lang].source})`);
  if (LANG_TYPE[lang]) parts.push(`(?<t>${LANG_TYPE[lang].source})`);
  parts.push(`(?<L>${LANG_LIT.source})`);
  const re = new RegExp(parts.join('|'), 'g');
  return escd.replace(re, (m, ...a) => {
    const g = a[a.length - 1] || {};
    if (g.c) return `<span class="t-c">${m}</span>`;
    if (g.s) return `<span class="t-s">${m}</span>`;
    if (g.n) return `<span class="t-n">${m}</span>`;
    if (g.v) return `<span class="t-v">${m}</span>`;
    if (g.k) return `<span class="t-k">${m}</span>`;
    if (g.t) return `<span class="t-t">${m}</span>`;
    if (g.L) return `<span class="t-k">${m}</span>`;
    return m;
  });
}

function tokenizeMd(line){
  let s = escCode(line);
  if (/^---\s*$/.test(s)) return `<span class="t-c">${s}</span>`;
  const h = s.match(/^(#{1,6}\s.*)$/);
  if (h) return `<span class="t-k">${h[1]}</span>`;
  s = s.replace(/^(\s*)([-*+])(\s)/, '$1<span class="t-k">$2</span>$3');
  s = s.replace(/`[^`]+`/g, m => `<span class="t-s">${m}</span>`);
  s = s.replace(/\*\*[^*]+\*\*/g, m => `<span class="t-k">${m}</span>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="t-v">[$1]</span><span class="t-s">($2)</span>');
  s = s.replace(/^([A-Za-z_][\w-]*)(:\s)/, '<span class="t-v">$1</span>$2');
  return s;
}

function renderCodeFig(lang, meta, code){
  const file = (meta.match(/file=(?:"([^"]+)"|(\S+))/) || [])[1]
            || (meta.match(/file=(\S+)/) || [])[1] || '';
  const label = LANG_LABEL[lang] || lang || '';
  const lines = (code || '').replace(/\n$/, '').split('\n');
  const rows = lines.map((line, i) =>
    `<div class="ln"><span class="num">${i + 1}</span><span class="src">${tokenizeLine(line, lang) || '​'}</span></div>`
  ).join('\n');
  return `<figure class="ide" data-lang="${esc(lang || '')}">
<div class="ide-head"><span class="dot"></span><span class="file">${escCode(file || lang || 'snippet')}</span><span class="lang">${escCode(label)}</span></div>
<div class="ide-body">
${rows}
</div>
</figure>`;
}

/* ====================================================================
   inline markdown → segments (text vs atomic element), then
   sentence-wrapped spans — mirrors the design's wrapSentences()
   ==================================================================== */
function renderInlineNodes(nodes, ctx){
  // returns array of segments: { text: true, s } | { text: false, s, fns: [] }
  const segs = [];
  for (const node of nodes || []){
    switch (node.type){
      case 'text':
        segs.push({ text: true, s: node.value });
        break;
      case 'emphasis':
        segs.push({ text: false, s: `<em>${inlineHtml(node.children, ctx)}</em>` });
        break;
      case 'strong':
        segs.push({ text: false, s: `<strong>${inlineHtml(node.children, ctx)}</strong>` });
        break;
      case 'delete':
        segs.push({ text: false, s: `<del>${inlineHtml(node.children, ctx)}</del>` });
        break;
      case 'inlineCode':
        segs.push({ text: false, s: `<code>${escCode(node.value)}</code>` });
        break;
      case 'break':
        segs.push({ text: false, s: '<br />' });
        break;
      case 'link': {
        const href = resolveLink(node.url, ctx);
        const ext = isExternalLink(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
        segs.push({ text: false, s: `<a href="${esc(href)}"${ext}>${inlineHtml(node.children, ctx)}</a>` });
        break;
      }
      case 'image':
        // an image inside running text renders inline; image-only
        // paragraphs are handled upstream as static figures
        segs.push({ text: false, s: `<img src="${esc(node.url)}" alt="${esc(node.alt || '')}" loading="lazy" />` });
        break;
      case 'footnoteReference': {
        const n = ctx.footnoteNumber(node.identifier);
        segs.push({ text: false, s: `<sup class="fn-ref"><a href="#fn-${n}" data-fn="${n}">${n}</a></sup>`, fn: n });
        break;
      }
      case 'html':
        segs.push({ text: false, s: node.value });
        break;
      default:
        if (node.children) segs.push(...renderInlineNodes(node.children, ctx));
        else if (node.value) segs.push({ text: true, s: node.value });
    }
  }
  return segs;
}
function inlineHtml(nodes, ctx){
  return renderInlineNodes(nodes, ctx).map(x => x.text ? esc(x.s) : x.s).join('');
}

// sentence terminator (one or more of .!?…), optional closing quote/paren, then whitespace
const SENT_END = /([.!?…]+["'’”)\]]?)(\s+)/;

function wrapSentences(segs){
  const spans = [];
  let cur = { html: '', fns: new Set() };
  const flush = () => {
    if (cur.html){
      spans.push(cur);
    }
    cur = { html: '', fns: new Set() };
  };
  for (const seg of segs){
    if (seg.text){
      let text = seg.s;
      let m;
      while ((m = SENT_END.exec(text))){
        const endIdx = m.index + m[1].length;
        const before = text.slice(0, endIdx);
        const wsAfter = m[2];
        if (before) cur.html += esc(before);
        flush();
        if (wsAfter) cur.html += wsAfter;
        text = text.slice(endIdx + wsAfter.length);
      }
      if (text) cur.html += esc(text);
    } else {
      cur.html += seg.s;
      if (seg.fn) cur.fns.add(String(seg.fn));
    }
  }
  flush();
  return spans.map(sp => {
    const fns = sp.fns.size ? ` data-fns="${[...sp.fns].join(' ')}"` : '';
    return `<span class="sent"${fns}>${sp.html}</span>`;
  }).join('');
}

/* ---------------- link resolution ---------------- */
// Links that leave the site open in a new tab; internal ones (relative,
// anchors, or absolute URLs back to our own host) stay in place. mailto:
// and tel: are handed to the OS, so they get no target either.
function isExternalLink(href){
  if (!/^https?:\/\//i.test(href)) return false;
  if (!SITE_URL) return true;
  try {
    return new URL(href).hostname !== new URL(SITE_URL).hostname;
  } catch { return false; }
}

function resolveLink(href, ctx){
  if (!href || /^(https?:|mailto:|tel:|#|\/)/.test(href)) return href || '';
  // relative link into another article folder or its index.md
  const cleaned = href.replace(/\/index\.md$/, '').replace(/\.md$/, '').replace(/\/+$/, '');
  const base = path.posix.basename(cleaned);
  const slug = slugFromFolder(base);
  if (ctx.slugSet.has(slug)) return `/a/${slug}/`;
  // otherwise treat as an asset relative to this article
  return href;
}

function slugFromFolder(name){
  return name.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

/* ====================================================================
   article parsing
   ==================================================================== */
const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm);

function extractImageBlocks(raw){
  // pull  :::image … :::  blocks out before markdown parsing;
  // their content is YAML, not markdown.
  const figures = [];
  const lines = raw.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++){
    if (/^:::image\s*$/.test(lines[i])){
      const buf = [];
      let j = i + 1;
      for (; j < lines.length && !/^:::\s*$/.test(lines[j]); j++) buf.push(lines[j]);
      if (j >= lines.length){ out.push(lines[i]); continue; } // unclosed — leave as text
      let meta;
      try { meta = YAML.parse(buf.join('\n')) || {}; }
      catch (e) { throw new Error(`bad YAML in :::image block (line ${i + 1}): ${e.message}`); }
      out.push('', `%%FIG${figures.length}%%`, '');
      figures.push(meta);
      i = j;
    } else {
      out.push(lines[i]);
    }
  }
  return { md: out.join('\n'), figures };
}

function parseArticle(dir, slugSet){
  const mdPath = path.join(dir, 'index.md');
  const raw = fs.readFileSync(mdPath, 'utf8');
  const { md, figures } = extractImageBlocks(raw);
  const tree = parser.parse(md);

  // frontmatter
  let fm = {};
  if (tree.children[0] && tree.children[0].type === 'yaml'){
    fm = YAML.parse(tree.children[0].value) || {};
    tree.children.shift();
  }
  const folder = path.basename(dir);
  const slug = fm.slug || slugFromFolder(folder);
  const date = fm.date instanceof Date ? fm.date : new Date(String(fm.date || folder.slice(0, 10)) + 'T00:00:00Z');
  if (isNaN(date)) throw new Error(`${folder}: missing/invalid date (frontmatter "date:" or YYYY-MM-DD- folder prefix)`);
  if (!fm.title) throw new Error(`${folder}: missing "title:" in frontmatter`);

  return { dir, folder, slug, date, title: String(fm.title), draft: !!fm.draft, description: fm.description || '', tree, figures };
}

async function renderArticleBody(article, slugSet){
  const ctx = {
    slugSet,
    fnOrder: [],
    footnoteNumber(id){
      let i = this.fnOrder.indexOf(id);
      if (i < 0){ this.fnOrder.push(id); i = this.fnOrder.length - 1; }
      return i + 1;
    }
  };

  // collect footnote definitions
  const fnDefs = {};
  const flow = [];
  for (const node of article.tree.children){
    if (node.type === 'footnoteDefinition'){
      fnDefs[node.identifier] = node;
    } else {
      flow.push(node);
    }
  }

  const parts = [];
  const figdata = [];
  const emittedNotes = new Set();
  let firstParagraphText = '';

  const emitSidenotes = () => {
    for (const id of ctx.fnOrder){
      if (emittedNotes.has(id)) continue;
      emittedNotes.add(id);
      const n = ctx.fnOrder.indexOf(id) + 1;
      const def = fnDefs[id];
      if (!def){ console.warn(`${article.folder}: footnote [^${id}] has no definition`); continue; }
      const inner = def.children
        .filter(c => c.type === 'paragraph')
        .map(c => inlineHtml(c.children, ctx))
        .join('<br />');
      parts.push(`<aside class="sidenote" id="fn-${n}" data-fn="${n}"><span class="num">${n}</span>${inner}</aside>`);
    }
  };

  const emitFigure = async (meta) => {
    const it = { ...meta };
    const zoomable = it.zoom !== false && it.modal !== false;
    delete it.zoom; delete it.modal;
    // normalize + rewrite src
    let localRel = null;
    let plan = null;
    if (it.src && !/^https?:/.test(it.src)){
      localRel = it.src.replace(/^\.\//, '');
      plan = await planImageVariants(article, localRel);
      // fallback file may have a different extension than the source
      // (e.g. a PNG re-encoded to JPEG) — reflect that in the served path
      const localRelForSrc = plan
        ? localRel.replace(/\.[^./]+$/, `.${plan.fallbackExt}`)
        : localRel;
      it.src = `/a/${article.slug}/${localRelForSrc}`;
    }
    if (!it.ratio && plan){
      it.ratio = plan.ratio;
    }
    if (it.tech && typeof it.tech === 'object'){
      it.tech = Object.fromEntries(Object.entries(it.tech).map(([k, v]) => [k, String(v)]));
    }
    if (typeof it.description === 'string' && it.description.includes('\n\n')){
      it.description = it.description.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    }

    if (plan){
      const base = it.src.replace(/\.[^./]+$/, '');
      it.img = {
        widths: plan.widths,
        avif: `${base}@{w}w.avif`,
        webp: `${base}@{w}w.webp`,
        fallback: `${base}@{w}w.${plan.fallbackExt}`
      };
    }

    const ratio = it.ratio ? ` style="--ratio:${esc(String(it.ratio))}"` : '';
    const toneStyle = it.tone ? ` style="--tone:${toneColorCss(it.tone)}"` : '';
    let inner;
    if (it.src && it.img){
      const alt = it.alt || it.title || it.caption || '';
      const sizes = '(max-width: 1024px) 100vw, 60vw';
      inner = `<div class="ph"${toneStyle}>${pictureMarkup(it.img, alt, sizes, it.src)}</div>`;
    } else if (it.src){
      inner = `<div class="ph"${toneStyle}><img src="${esc(it.src)}" alt="${esc(it.alt || it.title || it.caption || '')}" loading="lazy" /></div>`;
    } else {
      const lab = escCode((it.title || 'photograph').slice(0, 32));
      inner = `<div class="ph placeholder"${toneStyle}><span class="ph-label">${lab}</span></div>`;
    }
    delete it.alt;
    let cap = '';
    if (it.title || it.caption){
      const zoomHint = zoomable ? '<span class="cap-zoom">View ↗</span>' : '';
      cap = `<figcaption>${it.title ? `<span class="cap-title">${esc(it.title)}</span>` : ''}${it.caption ? `<span class="cap-caption">${esc(it.caption)}</span>` : ''}${zoomHint}</figcaption>`;
    }
    if (zoomable){
      const n = figdata.length;
      figdata.push(it);
      parts.push(`<figure class="photo" data-fig="${n}"${ratio}>${inner}${cap}</figure>`);
    } else {
      parts.push(`<figure class="photo static"${ratio}>${inner}${cap}</figure>`);
    }
  };

  for (const node of flow){
    switch (node.type){
      case 'paragraph': {
        const soleText = node.children.length === 1 && node.children[0].type === 'text'
          ? node.children[0].value.trim() : null;
        const figMatch = soleText && soleText.match(/^%%FIG(\d+)%%$/);
        if (figMatch){ await emitFigure(article.figures[+figMatch[1]] || {}); break; }
        // a paragraph that is only image(s) → static figure(s), no modal
        const nonWs = node.children.filter(c => !(c.type === 'text' && !c.value.trim()));
        if (nonWs.length && nonWs.every(c => c.type === 'image')){
          for (const img of nonWs){
            await emitFigure({ src: img.url, title: img.title || '', caption: img.alt || '', alt: img.alt || '', zoom: false });
          }
          break;
        }
        const segs = renderInlineNodes(node.children, ctx);
        if (!firstParagraphText){
          firstParagraphText = segs.filter(s => s.text).map(s => s.s).join(' ').replace(/\s+/g, ' ').trim();
        }
        parts.push(`<p>${wrapSentences(segs)}</p>`);
        emitSidenotes();
        break;
      }
      case 'code':
        parts.push(renderCodeFig(node.lang || '', node.meta || '', node.value));
        break;
      case 'heading':
        parts.push(`<h${node.depth}>${inlineHtml(node.children, ctx)}</h${node.depth}>`);
        break;
      case 'blockquote':
        parts.push(`<blockquote>${node.children.map(c => c.type === 'paragraph' ? `<p>${inlineHtml(c.children, ctx)}</p>` : '').join('')}</blockquote>`);
        break;
      case 'list': {
        const tag = node.ordered ? 'ol' : 'ul';
        const items = node.children.map(li =>
          `<li>${li.children.map(c => c.type === 'paragraph' ? inlineHtml(c.children, ctx) : '').join(' ')}</li>`
        ).join('\n');
        parts.push(`<${tag}>\n${items}\n</${tag}>`);
        break;
      }
      case 'thematicBreak':
        parts.push('<hr />');
        break;
      case 'html':
        parts.push(node.value);
        break;
      default:
        break;
    }
  }
  emitSidenotes();

  return { html: parts.join('\n'), figdata, firstParagraphText };
}

function toneColorCss(tone){
  switch (tone){
    case 'warm': return 'color-mix(in oklab, var(--bg) 60%, #c8a98a 40%)';
    case 'cool': return 'color-mix(in oklab, var(--bg) 60%, #98a6b1 40%)';
    case 'sage': return 'color-mix(in oklab, var(--bg) 60%, #9aa893 40%)';
    case 'blush': return 'color-mix(in oklab, var(--bg) 60%, #c6a39d 40%)';
    default: return 'color-mix(in oklab, var(--bg) 70%, var(--ink) 8%)';
  }
}

/* ====================================================================
   assets
   ==================================================================== */
const FORMAT_EXT = { avif: 'avif', webp: 'webp', jpeg: 'jpg', png: 'png' };
const ENCODE_OPTS = {
  avif: { quality: 50, effort: 4 },
  webp: { quality: 75 },
  jpeg: { quality: 82, mozjpeg: true },
  png: {}
};

// per-source-image plan of which AVIF/WebP/fallback width-tiers to generate.
// Pure metadata computation (no encoding) so both emitFigure (HTML/figdata)
// and copyArticleAssets (actual file writes) agree on the same naming
// scheme without re-reading the source file twice.
const variantPlanCache = new Map();
async function planImageVariants(article, rel){
  if (!sharp) return null;
  const key = `${article.dir}::${rel}`;
  if (variantPlanCache.has(key)) return variantPlanCache.get(key);
  const plan = await (async () => {
    try {
      const m = await sharp(path.join(article.dir, rel)).metadata();
      if (!m.width || !m.height) return null;
      const [w, h] = (m.orientation || 1) >= 5 ? [m.height, m.width] : [m.width, m.height];
      const ratio = `${w}/${h}`;
      const natWidth = Math.min(w, MAX_EDGE);
      const widths = [...new Set([...WIDTH_LADDER.filter(x => x <= natWidth), natWidth])].sort((a, b) => a - b);
      const ext = path.extname(rel).toLowerCase();
      const fallbackFormat = ext === '.avif' ? 'avif' : ext === '.webp' ? 'webp' : (m.hasAlpha ? 'png' : 'jpeg');
      const formats = [...new Set(['avif', 'webp', fallbackFormat])];
      return { ratio, widths, fallbackFormat, fallbackExt: FORMAT_EXT[fallbackFormat], formats };
    } catch { return null; }
  })();
  variantPlanCache.set(key, plan);
  return plan;
}

async function copyArticleAssets(article, outDir){
  const walk = (dir, rel = '') => {
    let files = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })){
      if (e.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) files = files.concat(walk(path.join(dir, e.name), r));
      else if (r !== 'index.md') files.push(r);
    }
    return files;
  };
  const files = walk(article.dir);
  const limit = Math.min(4, os.cpus().length || 4);
  await mapLimit(files, limit, async (rel) => {
    const src = path.join(article.dir, rel);
    const ext = path.extname(rel).toLowerCase();
    if (!(sharp && IMG_EXT.has(ext))){
      const dst = path.join(outDir, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      return;
    }
    const plan = await planImageVariants(article, rel);
    const outDirPath = path.join(outDir, path.dirname(rel));
    fs.mkdirSync(outDirPath, { recursive: true });
    if (!plan){
      // metadata read failed for some reason — fall back to plain resize/copy
      await sharp(src)
        .rotate()
        .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
        .toFile(path.join(outDir, rel));
      return;
    }
    const baseName = path.basename(rel, ext);
    // strip EXIF/GPS (sharp drops metadata by default), honor orientation, cap size
    await sharp(src)
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .toFormat(plan.fallbackFormat, ENCODE_OPTS[plan.fallbackFormat])
      .toFile(path.join(outDirPath, `${baseName}.${plan.fallbackExt}`));
    for (const format of plan.formats){
      for (const width of plan.widths){
        await sharp(src)
          .rotate()
          .resize(width, width, { fit: 'inside', withoutEnlargement: true })
          .toFormat(format, ENCODE_OPTS[format])
          .toFile(path.join(outDirPath, `${baseName}@${width}w.${FORMAT_EXT[format]}`));
      }
    }
  });
}

// resizes+re-encodes assets/404.png (a large, transparent illustration) into
// AVIF/WebP/PNG width tiers and returns a <picture> tag for the 404 page.
// Shown at one fixed spot in the layout, so a small dedicated ladder is used
// instead of the article WIDTH_LADDER.
async function buildNotFoundImage(){
  if (!sharp) return null;
  const src = path.join(ROOT, 'assets', '404.png');
  if (!fs.existsSync(src)) return null;
  const widths = [480, 960];
  const formats = ['avif', 'webp', 'png']; // source has real transparency — png fallback, not jpeg
  const outDirPath = path.join(OUT, 'assets');
  fs.mkdirSync(outDirPath, { recursive: true });
  for (const format of formats){
    for (const width of widths){
      await sharp(src)
        .resize(width, width, { fit: 'inside', withoutEnlargement: true })
        .toFormat(format, ENCODE_OPTS[format])
        .toFile(path.join(outDirPath, `404@${width}w.${FORMAT_EXT[format]}`));
    }
  }
  const img = { widths, avif: '/assets/404@{w}w.avif', webp: '/assets/404@{w}w.webp', fallback: '/assets/404@{w}w.png' };
  return pictureMarkup(img, '', '480px');
}

// builds a static 1200x630 social-card PNG (same 3x3 grid language as the
// animated mark / favicon, scaled up) used as the default og:image/twitter:image
// for pages that have no figure of their own to use instead.
async function buildDefaultOgImage(){
  if (!sharp) return;
  const W = 1200, H = 630;
  const cell = 120, gap = 30, span = 3 * cell + 2 * gap;
  const offsetX = (W - span) / 2, offsetY = (H - span) / 2;
  // mirrors the "frame" entry in assets/shared.js's PATTERNS (all cells filled except center)
  const FRAME = [1, 1, 1, 1, 0, 1, 1, 1, 1];
  const rects = FRAME.map((v, i) => {
    if (!v) return '';
    const r = Math.floor(i / 3), c = i % 3;
    const x = offsetX + c * (cell + gap);
    const y = offsetY + r * (cell + gap);
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#111111"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#ededed"/>${rects}</svg>`;
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, 'assets', 'og-default.png'));
}

/* ====================================================================
   page assembly
   ==================================================================== */
const tplArticle = fs.readFileSync(path.join(ROOT, 'templates', 'article.html'), 'utf8');
const tplIndex = fs.readFileSync(path.join(ROOT, 'templates', 'index.html'), 'utf8');

function fill(tpl, vars){
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ''));
}

const aboutHtml = (SITE.about || []).map(p => `      <p>${esc(p)}</p>`).join('\n');
const sfDefaults = JSON.stringify(SITE.tweaks);

function commonVars(){
  return {
    SITE_NAME: esc(SITE.name),
    ROLE: esc(SITE.role),
    ABOUT: aboutHtml,
    EMAIL: esc(SITE.email),
    SF_DEFAULTS: sfDefaults
  };
}

// builds a <picture> tag from a { widths, avif, webp, fallback }-shaped
// object (the same shape emitFigure attaches to figdata as `it.img`)
function pictureMarkup(img, alt, sizes, fallbackSrc){
  const srcset = (tmpl) => esc(img.widths.map(w => `${tmpl.replace('{w}', w)} ${w}w`).join(', '));
  const src = fallbackSrc || img.fallback.replace('{w}', img.widths[img.widths.length - 1]);
  return `<picture>` +
    `<source type="image/avif" srcset="${srcset(img.avif)}" sizes="${sizes}">` +
    `<source type="image/webp" srcset="${srcset(img.webp)}" sizes="${sizes}">` +
    `<img src="${esc(src)}" srcset="${srcset(img.fallback)}" sizes="${sizes}" alt="${esc(alt)}" loading="lazy" />` +
    `</picture>`;
}

function buildArticleJsonLd(a, desc, ogImage){
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    datePublished: a.date.toISOString().slice(0, 10),
    description: desc
  };
  if (SITE_URL) ld.url = abs(`/a/${a.slug}/`);
  if (SITE.name) ld.author = { '@type': 'Person', name: SITE.name };
  if (ogImage) ld.image = ogImage;
  return ld;
}

function buildSiteJsonLd(){
  const ld = { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name };
  if (SITE_URL) ld.url = SITE_URL;
  if (SITE.description) ld.description = SITE.description;
  return ld;
}

function jsonLdScript(ld){
  return JSON.stringify(ld).replace(/</g, '\\u003c');
}

/* ---------------- main ---------------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const articleDirs = fs.readdirSync(path.join(CONTENT, 'articles'), { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('.'))
  .map(e => path.join(CONTENT, 'articles', e.name))
  .filter(d => fs.existsSync(path.join(d, 'index.md')));

const slugSet = new Set(articleDirs.map(d => slugFromFolder(path.basename(d))));
let articles = articleDirs.map(d => parseArticle(d, slugSet)).filter(a => !a.draft);
articles.sort((a, b) => b.date - a.date);

const dupes = articles.map(a => a.slug).filter((s, i, arr) => arr.indexOf(s) !== i);
if (dupes.length) throw new Error('duplicate slugs: ' + dupes.join(', '));

for (let i = 0; i < articles.length; i++){
  const a = articles[i];
  const { html, figdata, firstParagraphText } = await renderArticleBody(a, slugSet);

  const prev = i > 0 ? articles[i - 1] : null;          // newer
  const next = i < articles.length - 1 ? articles[i + 1] : null; // older
  const pager =
    (prev ? `<a class="prev" href="/a/${prev.slug}/"><span class="label">← Newer</span><span>${esc(prev.title)}</span></a>`
          : '<span class="prev empty"></span>') +
    (next ? `<a class="next" href="/a/${next.slug}/"><span class="label">Older →</span><span>${esc(next.title)}</span></a>`
          : '<span class="next empty"></span>');

  const outDir = path.join(OUT, 'a', a.slug);
  fs.mkdirSync(outDir, { recursive: true });
  const desc = a.description || (firstParagraphText.length > 220 ? firstParagraphText.slice(0, 217) + '…' : firstParagraphText);
  const ogImagePath = figdata[0]?.img?.fallback?.replace('{w}', figdata[0].img.widths[figdata[0].img.widths.length - 1])
    || figdata[0]?.src
    || (sharp ? '/assets/og-default.png' : null);
  const ogImage = ogImagePath ? abs(ogImagePath) : '';
  fs.writeFileSync(path.join(outDir, 'index.html'), fill(tplArticle, {
    ...commonVars(),
    PAGE_TITLE: `${esc(a.title)} — ${esc(SITE.name)}`,
    DESCRIPTION: esc(desc),
    DATE: fmtLong(a.date),
    TITLE: esc(a.title),
    BODY: html,
    PAGER: pager,
    FIGDATA: JSON.stringify(figdata).replace(/</g, '\\u003c'),
    CANONICAL_URL: abs(`/a/${a.slug}/`),
    OG_TYPE: 'article',
    OG_TITLE: esc(a.title),
    OG_DESCRIPTION: esc(desc),
    OG_IMAGE: esc(ogImage),
    TWITTER_CARD: 'summary_large_image',
    FEED_URL: abs('/feed.xml'),
    JSONLD: jsonLdScript(buildArticleJsonLd(a, desc, ogImage))
  }));
  await copyArticleAssets(a, outDir);
  console.log(`  /a/${a.slug}/  (${figdata.length} figure${figdata.length === 1 ? '' : 's'})`);
}

/* ---------------- index ---------------- */
const byYear = new Map();
for (const a of articles){
  const y = a.date.getUTCFullYear();
  if (!byYear.has(y)) byYear.set(y, []);
  byYear.get(y).push(a);
}
let gi = 0;
const groups = [...byYear.entries()].map(([year, list]) => {
  const delay = gi++ ? ` style="--d:${gi * 60 - 60}ms"` : '';
  const entries = list.map(a =>
    `          <li><a class="entry" href="/a/${a.slug}/"><span class="date">${fmtShort(a.date)}</span><span class="title">${esc(a.title)}</span></a></li>`
  ).join('\n');
  return `      <div class="group rise"${delay}>
        <h3 class="year">${year}</h3>
        <ul class="entries">
${entries}
        </ul>
      </div>`;
}).join('\n\n');

fs.writeFileSync(path.join(OUT, 'index.html'), fill(tplIndex, {
  ...commonVars(),
  PAGE_TITLE: esc(SITE.name),
  DESCRIPTION: esc(SITE.description || ''),
  GROUPS: groups,
  CANONICAL_URL: abs('/'),
  OG_TYPE: 'website',
  OG_TITLE: esc(SITE.name),
  OG_DESCRIPTION: esc(SITE.description || ''),
  OG_IMAGE: esc(sharp ? abs('/assets/og-default.png') : ''),
  TWITTER_CARD: 'summary_large_image',
  FEED_URL: abs('/feed.xml'),
  JSONLD: jsonLdScript(buildSiteJsonLd())
}));

/* ---------------- static assets + housekeeping ---------------- */
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'assets'))){
  if (f === '404.png' && sharp) continue; // processed separately into optimized variants below
  fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(OUT, 'assets', f));
}
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const notFoundImg = await buildNotFoundImage();
await buildDefaultOgImage();

if (SITE_URL){
  const host = new URL(SITE_URL).hostname;
  if (host && !host.endsWith('.github.io')){
    fs.writeFileSync(path.join(OUT, 'CNAME'), host + '\n');
  }
}

const robotsLines = ['User-agent: *', 'Allow: /'];
if (SITE_URL) robotsLines.push('', `Sitemap: ${abs('/sitemap.xml')}`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), robotsLines.join('\n') + '\n');

if (SITE_URL){
  const urls = [
    { loc: abs('/'), lastmod: articles[0]?.date || null },
    ...articles.map(a => ({ loc: abs(`/a/${a.slug}/`), lastmod: a.date }))
  ];
  const body = urls.map(u => `  <url>\n    <loc>${esc(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}\n  </url>`).join('\n');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
}

if (SITE_URL){
  const updated = (articles[0]?.date || new Date()).toISOString();
  const entries = articles.map(a => {
    const d = a.description || '';
    return `  <entry>
    <title>${esc(a.title)}</title>
    <link href="${esc(abs(`/a/${a.slug}/`))}" />
    <id>${esc(abs(`/a/${a.slug}/`))}</id>
    <updated>${a.date.toISOString()}</updated>
    <summary>${esc(d)}</summary>
  </entry>`;
  }).join('\n');
  fs.writeFileSync(path.join(OUT, 'feed.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <title>${esc(SITE.name)}</title>\n  <link href="${esc(SITE_URL + '/')}" />\n  <link href="${esc(abs('/feed.xml'))}" rel="self" />\n  <id>${esc(SITE_URL + '/')}</id>\n  <updated>${updated}</updated>\n${entries}\n</feed>\n`);
}

// minimal 404 that keeps the design language
fs.writeFileSync(path.join(OUT, '404.html'), fill(tplArticle, {
  ...commonVars(),
  PAGE_TITLE: `Not found — ${esc(SITE.name)}`,
  DESCRIPTION: '',
  DATE: '—',
  TITLE: 'Not found',
  BODY: (notFoundImg ? `<figure class="photo static" style="--ratio:3/2"><div class="ph" style="background:transparent">${notFoundImg}</div></figure>\n` : '') +
    '<p><span class="sent">This page doesn’t exist (or hasn’t been written yet).</span></p>',
  PAGER: '<span class="prev empty"></span><span class="next empty"></span>',
  FIGDATA: '[]',
  CANONICAL_URL: '',
  OG_TYPE: '',
  OG_TITLE: '',
  OG_DESCRIPTION: '',
  OG_IMAGE: '',
  TWITTER_CARD: '',
  FEED_URL: abs('/feed.xml'),
  JSONLD: ''
}));

console.log(`\nBuilt ${articles.length} article${articles.length === 1 ? '' : 's'} → ${OUT}`);
