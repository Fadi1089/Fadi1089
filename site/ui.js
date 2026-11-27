// Small page behaviours: day/night toggle, the Léa Learn steps, copying the
// email address, magnetic buttons, and kickers that scramble into place.
// All of them respect prefers-reduced-motion.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

let tr = (k) => k;

/* ------------------------------------------------------------------ */
/* Day / night                                                         */
/* ------------------------------------------------------------------ */

const themeBtn = document.getElementById("theme");
let night = false;
let onTheme = () => {};

function labelTheme() {
  themeBtn.setAttribute("aria-pressed", String(night));
  themeBtn.setAttribute("aria-label", tr(night ? "theme.day" : "theme.night"));
  themeBtn.title = themeBtn.getAttribute("aria-label");
}

function setNight(v, instant) {
  night = v;
  document.documentElement.classList.toggle("night", night);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", night ? "#060d16" : "#0d2433");
  labelTheme();
  onTheme(night, instant);
}

// Starts from the reader's saved choice, else their system setting.
// cb(night, instant) is told every change; the island follows it.
export function initTheme(cb) {
  onTheme = cb;
  const saved = store.get("theme");
  setNight(saved ? saved === "night" : matchMedia("(prefers-color-scheme: dark)").matches, true);
  themeBtn.addEventListener("click", () => {
    setNight(!night, reduceMotion);
    store.set("theme", night ? "night" : "day");
  });
}

/* ------------------------------------------------------------------ */
/* Léa Learn: a request moving through its six steps                   */
/* ------------------------------------------------------------------ */

function initSteps() {
  for (const box of document.querySelectorAll("[data-steps]")) {
    const nodes = [...box.querySelectorAll(".track i")];
    const names = [...box.querySelectorAll(".step-names li")];
    const n = nodes.length;
    let at = -1, timer = 0;
    const show = (k) => {
      at = k;
      box.style.setProperty("--p", n > 1 ? k / (n - 1) : 1);
      nodes.forEach((el, j) => el.classList.toggle("on", j <= k));
      names.forEach((el, j) => {
        el.classList.toggle("now", j === k);
        el.classList.toggle("was", j < k);
        el.setAttribute("aria-hidden", String(j !== k));
      });
    };
    if (reduceMotion) { show(n - 1); continue; }
    const tick = () => {
      if (at >= n - 1) {
        // Hold on "closed", then start over with a new request.
        names.forEach((el) => el.classList.remove("was", "now"));
        show(0);
        timer = setTimeout(tick, 900);
        return;
      }
      show(at + 1);
      timer = setTimeout(tick, at === n - 1 ? 2200 : 900);
    };
    show(0);
    new IntersectionObserver(([e]) => {
      clearTimeout(timer);
      if (e.isIntersecting) timer = setTimeout(tick, 600);
    }, { threshold: 0.4 }).observe(box);
  }
}

/* ------------------------------------------------------------------ */
/* Copy the email address                                              */
/* ------------------------------------------------------------------ */

function initCopy() {
  for (const btn of document.querySelectorAll("[data-copy]")) {
    const label = btn.querySelector(".copy-label");
    const icon = btn.querySelector(".copy-ico");
    let reset = 0;
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
      } catch {
        return; // no clipboard access: the mailto link above still works
      }
      btn.classList.add("done");
      icon.setAttribute("href", "#i-check");
      label.textContent = tr("contact.copied");
      clearTimeout(reset);
      reset = setTimeout(() => {
        btn.classList.remove("done");
        icon.setAttribute("href", "#i-copy");
        label.textContent = tr("contact.copy");
      }, 1800);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Magnetic buttons                                                    */
/* ------------------------------------------------------------------ */

function initMagnetic() {
  if (reduceMotion || !matchMedia("(pointer: fine)").matches) return;
  for (const el of document.querySelectorAll("#regen, .go")) {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${(e.clientX - (r.left + r.width / 2)) * 0.22}px`);
      el.style.setProperty("--my", `${(e.clientY - (r.top + r.height / 2)) * 0.3}px`);
    });
    el.addEventListener("pointerleave", () => {
      el.style.setProperty("--mx", "0px");
      el.style.setProperty("--my", "0px");
    });
  }
}

/* ------------------------------------------------------------------ */
/* Kickers scramble into place                                         */
/* ------------------------------------------------------------------ */

// Each letter starts as a random tile glyph and settles, left to right: a
// small nod to Wave Function Collapse, which grows the island.
const GLYPHS = "▖▗▘▙▚▛▜▝▞▟";
const running = new Map();

function scramble(el) {
  const final = el.textContent;
  running.get(el)?.();
  let frame = 0, raf = 0;
  const total = 22 + final.length;
  const step = () => {
    frame++;
    const settled = Math.floor((frame / total) * final.length * 1.4);
    let out = "";
    for (let i = 0; i < final.length; i++) {
      const ch = final[i];
      out += i < settled || ch === " " || ch === "·" ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (settled < final.length) raf = requestAnimationFrame(step);
    else { el.textContent = final; running.delete(el); }
  };
  running.set(el, () => { cancelAnimationFrame(raf); el.textContent = final; running.delete(el); });
  raf = requestAnimationFrame(step);
}

function initScramble() {
  if (reduceMotion) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { scramble(e.target); io.unobserve(e.target); }
  }, { threshold: 1 });
  document.querySelectorAll(".kicker").forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------ */

// Called once after the first language pass; again (refresh) on each change.
export function initUI(translate) {
  tr = translate;
  initSteps();
  initCopy();
  initMagnetic();
  initScramble();
}

export function refreshUI() {
  for (const stop of running.values()) stop();
  labelTheme();
}
