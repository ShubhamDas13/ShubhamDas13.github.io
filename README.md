# Shubham Das — Portfolio

A static two-page site. Open `index.html` in a browser; no build step.

```
Project-1/
├── index.html              Work portfolio (TCIL, experience, projects)
├── social.html             Social page ("golden hour": travel, music, football)
└── assets/
    ├── css/
    │   ├── main.css        Styles for index.html
    │   └── social.css      Styles for social.html
    ├── js/
    │   ├── main.js         index.html: menu, scroll progress, counters, timeline, lifecycle stepper
    │   └── social.js       social.html: sunset scroll, snow, generated music, keys, football game, lightbox
    ├── images/
    │   ├── projects/       Screenshots used on the project cards
    │   └── travel/         Travel photos for the social page postcards
    └── docs/
        └── Shubham_Das_Resume.pdf
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
