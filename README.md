# msmcntmr.github.io — vuotogeometrico

Site shell and static-site generator for [vuotogeometrico](https://msmcntmr.github.io/).

Articles live in a **private** content repo (`vuotogeometrico-content`) as markdown.
Pushing there runs its `publish` workflow, which checks out this repo for the
templates + generator, builds the site, and force-publishes the result to this
repo's `gh-pages` branch, which GitHub Pages serves. Only rendered HTML and
processed images (EXIF stripped, resized) ever become public.

```
templates/article.html   page template (from the Claude Design mockup)
templates/index.html     index template
assets/shared.css        design system: tweaks panel, transitions
assets/shared.js         palettes, typefaces, morphing mark, text-size, panel swap
assets/article.js        article runtime: image modal, pan-to-explore, footnote hover
scripts/build.mjs        markdown → static site generator
```

## Local build

```sh
npm install
node scripts/build.mjs --content ../vuotogeometrico-content --out _site
cd _site && python3 -m http.server 8422
```

## After changing templates/assets/generator

Push to `main` here, then re-run the publisher:

```sh
gh workflow run publish -R msmcntmr/vuotogeometrico-content
```

(Article pushes to the content repo republish automatically.)
