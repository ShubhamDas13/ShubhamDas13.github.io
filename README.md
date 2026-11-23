# Shubham Das — Portfolio

A static two-page site. Open `index.html` in a browser; no build step.

```
Project-1/
├── index.html              Work portfolio (TCIL, experience, projects)
├── social.html             Social page ("golden hour": travel, music, football)
├── games.html              Arcade page: Nimbus (playable) and Warxel
├── 404.html                "Page not found" page (GitHub Pages uses it automatically)
├── robots.txt, sitemap.xml For search engines
├── README.md
├── .gitignore
├── assets/                 Everything the three pages share
│   ├── css/                main.css (index) · social.css · games.css
│   ├── js/                 main.js (index) · social.js · games.js
│   ├── images/
│   │   ├── og/             1200×630 link-preview images, one per page
│   │   ├── projects/       Screenshots on the project cards
│   │   └── travel/         Spare folder for travel photos (tools/clean-photos.py writes here)
│   ├── media/              Social page photos, reels (MP4 + poster) and lens-*.webp gallery shots
│   ├── fonts/              Self-hosted web fonts (+ licence)
│   └── docs/               Shubham_Das_Resume.pdf
├── games/
│   ├── README.md           How to add browser builds
│   ├── nimbus/             Nimbus, ported to the web (self-contained, see its README)
│   │   ├── index.html
│   │   ├── js/             nimbus.js (engine + gameplay) · data.js (levels, generated)
│   │   └── assets/         img/ (original art) · audio/ (original sound)
│   └── warxel/             Put Warxel's Unity WebGL build here when you have one
└── tools/
    └── nimbus-port/        Python scripts that converted the Unity build (not used by the site)
```

## Adding a travel photo

1. Put the image in `assets/images/travel/`.
2. In `social.html`, find a postcard and replace its placeholder
   `<div class="photo photo--empty …">…</div>` with:

   ```html
   <button type="button" class="photo"><img src="assets/images/travel/FILE.jpg" alt="What the photo shows" loading="lazy" /></button>
   ```

3. Change the text in that postcard's `<p class="postcard-caption">`.

Postcard frames are square, so square or near-square photos fit best.

## Changing CSS or JS

`social.html` loads its files with a version tag (`?v=5`) so browsers fetch the latest copy.
Bump the number after editing `social.css` or `social.js` if a browser shows the old version.
