/* Mobile menu */
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");
menuToggle?.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!open));
  navLinks?.classList.toggle("is-open", !open);
});
navLinks?.addEventListener("click", (e) => {
  if (e.target instanceof Element && e.target.closest("a")) {
    menuToggle?.setAttribute("aria-expanded", "false");
    navLinks.classList.remove("is-open");
  }
});

/*
  Each cabinet loads a Unity WebGL build from its data-src (e.g. games/warxel/index.html).
  If the build isn't there yet, the cabinet shows a "coming soon" message instead.
*/
const buildExists = async (src) => {
  try {
    const res = await fetch(src, { method: "HEAD", cache: "no-store" });
    if (res.ok) return true;
    if (res.status === 405) return (await fetch(src, { cache: "no-store" })).ok;
    return false;
  } catch {
    return null; // unknown (e.g. opened from the file system)
  }
};

document.querySelectorAll(".cabinet").forEach(async (cabinet) => {
  const src = cabinet.dataset.src;
  const screen = cabinet.querySelector(".screen");
  const idle = cabinet.querySelector(".screen-idle");
  const start = cabinet.querySelector("[data-start]");
  const note = cabinet.querySelector("[data-note]");
  const fullscreenBtn = cabinet.querySelector("[data-fullscreen]");
  const download = cabinet.querySelector('a[href$=".zip"]')?.getAttribute("href");
  if (!src || !screen || !start) return;

  const available = await buildExists(src);
  if (available === false) {
    start.disabled = true;
    start.textContent = "COMING SOON";
    if (note) {
      const link = document.createElement("a");
      link.href = download || "#";
      link.textContent = "download the Windows build";
      note.replaceChildren("The browser version is on its way. Until then, ", link, ".");
    }
    return;
  }

  start.addEventListener("click", () => {
    const loading = document.createElement("p");
    loading.className = "loading";
    loading.textContent = "LOADING…";
    start.replaceWith(loading);

    const frame = document.createElement("iframe");
    frame.src = src;
    frame.title = `${cabinet.querySelector("h2")?.textContent || "Game"} (Unity WebGL)`;
    frame.allow = "fullscreen; autoplay; gamepad";
    frame.setAttribute("allowfullscreen", "");
    frame.addEventListener("load", () => {
      idle?.remove();
      frame.focus();
    });
    screen.appendChild(frame);
    if (fullscreenBtn) fullscreenBtn.disabled = false;
  });

  fullscreenBtn?.addEventListener("click", () => {
    const frame = screen.querySelector("iframe");
    const target = frame || screen;
    (target.requestFullscreen || target.webkitRequestFullscreen)?.call(target);
  });
});

/* Konami code easter egg: ↑ ↑ ↓ ↓ ← → ← → B A */
const code = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let pos = 0;
document.addEventListener("keydown", (e) => {
  if (document.activeElement?.tagName === "IFRAME") return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  pos = key === code[pos] ? pos + 1 : key === code[0] ? 1 : 0;
  if (pos === code.length) {
    pos = 0;
    const hs = document.querySelector(".hiscore b");
    if (hs) hs.textContent = "999999";
    document.body.animate(
      [{ filter: "hue-rotate(0deg)" }, { filter: "hue-rotate(360deg)" }],
      { duration: 1200, easing: "ease-in-out" }
    );
  }
});
