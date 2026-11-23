const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");

if (menuToggle && siteNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    siteNav.classList.toggle("is-open", !isOpen);
  });

  siteNav.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      menuToggle.setAttribute("aria-expanded", "false");
      siteNav.classList.remove("is-open");
    }
  });
}

const copyEmailButton = document.querySelector(".copy-email");
const copyFeedback = document.querySelector(".copy-feedback");

if (copyEmailButton && copyFeedback) {
  copyEmailButton.addEventListener("click", async () => {
    const email = copyEmailButton.getAttribute("data-email");

    if (!email) {
      copyFeedback.textContent = "Email address is unavailable.";
      return;
    }

    try {
      await navigator.clipboard.writeText(email);
      copyFeedback.textContent = "Email address copied.";
    } catch {
      copyFeedback.textContent = "Copy unavailable. Use the email link above.";
    }
  });
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Scroll progress bar + active nav link */
const header = document.querySelector(".site-header");
const navLinks = [...document.querySelectorAll(".site-nav a[href^='#']")];
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

const onScroll = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  header?.style.setProperty("--scroll", max > 0 ? String(window.scrollY / max) : "0");

  const marker = window.scrollY + window.innerHeight * 0.35;
  let current = null;
  for (const section of sections) {
    if (section.offsetTop <= marker) current = section;
  }
  navLinks.forEach((link) => {
    link.classList.toggle("is-current", current !== null && link.getAttribute("href") === `#${current.id}`);
  });
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* Hero spotlight + board tilt that follow the cursor */
const hero = document.querySelector(".hero");
const board = document.querySelector(".board");
if (hero && !reduceMotion && window.matchMedia("(hover: hover)").matches) {
  hero.addEventListener("pointermove", (event) => {
    const rect = hero.getBoundingClientRect();
    hero.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    hero.style.setProperty("--my", `${event.clientY - rect.top}px`);

    if (board) {
      const b = board.getBoundingClientRect();
      const x = (event.clientX - (b.left + b.width / 2)) / b.width;
      const y = (event.clientY - (b.top + b.height / 2)) / b.height;
      board.style.setProperty("--ry", `${Math.max(-1, Math.min(1, x)) * 5}deg`);
      board.style.setProperty("--rx", `${Math.max(-1, Math.min(1, y)) * -5}deg`);
    }
  });
  hero.addEventListener("pointerleave", () => {
    board?.style.setProperty("--rx", "0deg");
    board?.style.setProperty("--ry", "0deg");
  });
}

/* Count-up for the highlight numbers */
const countUp = (el) => {
  const target = parseFloat(el.dataset.count);
  const decimals = Number(el.dataset.decimals || 0);
  const pad = Number(el.dataset.pad || 0);
  const format = (n) => {
    const text = n.toFixed(decimals);
    return pad ? text.padStart(pad, "0") : text;
  };
  if (reduceMotion) {
    el.textContent = format(target);
    return;
  }
  const start = performance.now();
  const duration = 1200;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/* Reveal sections, grow Gantt bars, run counters when they enter the viewport */
const revealTargets = document.querySelectorAll(
  ".section-head, .phases, .role, .package, .about-copy, .card, .contact-inner, .board"
);
revealTargets.forEach((el) => el.classList.add("reveal"));

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add("is-visible");
        if (el.dataset.count) countUp(el);
        observer.unobserve(el);
      });
    },
    { threshold: 0.15 }
  );
  revealTargets.forEach((el) => observer.observe(el));
  document.querySelectorAll(".gantt, [data-count]").forEach((el) => observer.observe(el));
} else {
  document.querySelectorAll(".reveal, .gantt").forEach((el) => el.classList.add("is-visible"));
}

/* Delivery lifecycle stepper: auto-advances until the visitor picks a stage */
const phaseList = document.querySelector(".phases");
const phases = phaseList ? [...phaseList.querySelectorAll(".phase")] : [];
if (phases.length) {
  let active = 0;
  let timer = null;

  const setPhase = (index) => {
    active = index;
    phases.forEach((phase, i) => {
      phase.classList.toggle("is-active", i === index);
      phase.classList.toggle("is-done", i < index);
      phase.setAttribute("aria-current", i === index ? "step" : "false");
    });
    phaseList.style.setProperty("--p", String(index / (phases.length - 1)));
  };

  const stopAuto = () => {
    clearInterval(timer);
    timer = null;
  };

  phases.forEach((phase, i) => {
    phase.tabIndex = 0;
    phase.setAttribute("role", "button");
    phase.addEventListener("click", () => {
      stopAuto();
      setPhase(i);
    });
    phase.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        stopAuto();
        setPhase(i);
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        stopAuto();
        phases[Math.min(i + 1, phases.length - 1)].focus();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        stopAuto();
        phases[Math.max(i - 1, 0)].focus();
      }
    });
  });

  setPhase(0);

  if (!reduceMotion && "IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && timer === null && active < phases.length - 1) {
          timer = setInterval(() => {
            if (active >= phases.length - 1) return stopAuto();
            setPhase(active + 1);
          }, 1800);
        } else if (!entry.isIntersecting) {
          stopAuto();
        }
      },
      { threshold: 0.5 }
    ).observe(phaseList);
  }
}
