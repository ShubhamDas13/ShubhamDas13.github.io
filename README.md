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
│   │   └── projects/       Screenshots on the project cards
│   ├── media/              Social page photos, reels (MP4 + poster) and lens-*.webp gallery shots
│   ├── fonts/              Self-hosted web fonts (+ licence)
│   └── docs/               Shubham_Das_Resume.pdf
├── games/
│   ├── README.md           How to add browser builds
│   └── nimbus/             Nimbus, ported to the web (self-contained, see its README)
│   │   ├── index.html
│   │   ├── js/             nimbus.js (engine + gameplay) · data.js (levels, generated)
│   │   └── assets/         img/ (original art) · audio/ (original sound)
└── tools/
    └── nimbus-port/        Python scripts that converted the Unity build (not used by the site)
```

## Adding a photo to the social page

1. Clean it first (removes GPS location and other hidden data, resizes for the web):
   `python3 tools/clean-photos.py ~/Desktop/photo.jpg` (writes to `assets/media/`).
2. In `social.html`, copy one `<figure class="postcard">` (or a moments / lens tile) and change the
   image path, `alt` text and caption.

## Changing CSS or JS

`social.html` loads its files with a version tag (`?v=5`) so browsers fetch the latest copy.
Bump the number after editing `social.css` or `social.js` if a browser shows the old version.
