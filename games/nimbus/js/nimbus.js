/*
  Nimbus — web port.
  Original game made in Unity by Shubham Das. Levels, art, sounds, animation timings and all gameplay
  numbers come from the original build (see data.js); the logic below mirrors the original C# scripts
  (PlayerController, UmibozuController, RavenController, BossController, BulletController, Health, ...).
*/
(() => {
  "use strict";
  const D = window.NIMBUS_DATA;
  const DT = D.fixedDt;              // Unity fixed timestep (0.02 s)
  const GRAVITY = D.gravity;         // -9.81
  const SUBSTEPS = 4;
  const FRICTION = 0.4;              // Unity default 2D friction (no physics material)
  const MUSIC_GAIN = 3;              // the original music volumes (0.04 / 0.1) are very quiet in a browser
  const SFX_GAIN = 0.6;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const loadingEl = document.getElementById("loading");
  const muteBtn = document.getElementById("mute");
  const touchEl = document.getElementById("touch");

  /* ------------------------------------------------------------------ assets */
  const IMG = {};
  const loadImages = () =>
    Promise.all(
      Object.entries(D.images).map(
        ([tex, info]) =>
          new Promise((res) => {
            const im = new Image();
            im.onload = im.onerror = () => res();
            im.src = "assets/img/" + info.file;
            IMG[tex] = { el: im, ...info, pixel: /\(32x32\)|heart|^level/.test(tex) };
          })
      )
    );

  /* ------------------------------------------------------------------ audio */
  let muted = false;
  try { muted = localStorage.getItem("nimbus-muted") === "1"; } catch {}
  const audioBase = {};
  const audioSrc = (name) => "assets/audio/" + D.audio[name];
  const sfx = (name, vol = 1) => {
    if (muted || !D.audio[name]) return null;
    let base = audioBase[name];
    if (!base) { base = audioBase[name] = new Audio(audioSrc(name)); base.preload = "auto"; }
    const a = base.cloneNode();
    a.volume = Math.min(1, vol * SFX_GAIN);
    a.play().catch(() => {});
    return a;
  };
  const loops = new Map(); // key -> HTMLAudioElement
  const loopSet = (key, name, vol) => {
    let a = loops.get(key);
    if (vol <= 0.001 || muted) { if (a && !a.paused) a.pause(); return; }
    if (!a) { a = new Audio(audioSrc(name)); a.loop = true; loops.set(key, a); }
    a.volume = Math.min(1, vol);
    if (a.paused) a.play().catch(() => {});
  };
  const stopAllLoops = () => { loops.forEach((a) => a.pause()); loops.clear(); };
  let music = null;
  const playMusic = (spec) => {
    if (music) { music.pause(); music = null; }
    if (!spec || muted) return;
    music = new Audio(audioSrc(spec.clip));
    music.loop = true;
    music.volume = Math.min(1, spec.volume * MUSIC_GAIN);
    music.play().catch(() => {});
  };
  const updateMuteBtn = () => { muteBtn.textContent = muted ? "🔇" : "🔊"; muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound"); };
  const toggleMute = () => {
    muted = !muted;
    try { localStorage.setItem("nimbus-muted", muted ? "1" : "0"); } catch {}
    updateMuteBtn();
    if (muted) { if (music) music.pause(); stopAllLoops(); }
    else if (scene && scene.music) playMusic(scene.music);
  };
  muteBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMute(); canvas.focus(); });
  updateMuteBtn();

  /* ------------------------------------------------------------------ input */
  const held = { left: false, right: false };
  const pressed = { jump: false, dash: false, attack: false }; // edge-triggered, consumed by Update
  const keymap = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
  addEventListener("keydown", (e) => {
    if (keymap[e.code]) { held[keymap[e.code]] = true; e.preventDefault(); }
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "KeyW" || e.code === "ArrowUp") { pressed.jump = true; e.preventDefault(); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "KeyK") pressed.dash = true;
    if (e.code === "KeyJ" || e.code === "KeyX") pressed.attack = true;
    if (e.code === "KeyM") toggleMute();
    if ((e.code === "Escape" || e.code === "KeyP") && world) setPaused(!paused);
    if (e.code === "Enter" && menu) menu.activate();
  });
  addEventListener("keyup", (e) => { if (keymap[e.code]) held[keymap[e.code]] = false; });
  let paused = false;
  const setPaused = (v) => {
    paused = v && !!world;
    if (paused) { if (music) music.pause(); loops.forEach((a) => a.pause()); }
    else if (music && !muted) music.play().catch(() => {});
    for (const k in held) held[k] = false;
  };
  addEventListener("blur", () => { held.left = held.right = false; if (world) setPaused(true); });

  const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  touchEl.querySelectorAll("button").forEach((b) => {
    const k = b.dataset.key;
    const down = (e) => { e.preventDefault(); if (paused) setPaused(false); b.classList.add("down"); if (k in held) held[k] = true; else pressed[k] = true; };
    const up = (e) => { e.preventDefault(); b.classList.remove("down"); if (k in held) held[k] = false; };
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("pointerleave", up);
  });

  /* ------------------------------------------------------------------ canvas */
  let W = 0, H = 0, DPR = 1;
  const resize = () => {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(innerWidth * DPR); H = Math.round(innerHeight * DPR);
    canvas.width = W; canvas.height = H;
  };
  addEventListener("resize", resize);
  resize();

  /* ------------------------------------------------------------------ helpers */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const unitySign = (v) => (v >= 0 ? 1 : -1); // Mathf.Sign(0) == 1

  function clipFrame(name, t) {
    const c = D.clips[name];
    const tt = c.loop ? t % c.length : Math.min(t, c.length);
    let i = 0;
    for (let k = 0; k < c.times.length; k++) if (tt >= c.times[k]) i = k;
    return c.frames[i];
  }

  /* ------------------------------------------------------------------ physics world */
  function makeSegments(sc) {
    const segs = [];
    const add = (ax, ay, bx, by, platform) => {
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      if (len2 < 1e-10) return;
      segs.push({ ax, ay, bx, by, dx, dy, len2, platform, minx: Math.min(ax, bx), maxx: Math.max(ax, bx), miny: Math.min(ay, by), maxy: Math.max(ay, by) });
    };
    for (const path of sc.solids) {
      for (let i = 0; i < path.length; i++) {
        const a = path[i], b = path[(i + 1) % path.length];
        add(a[0], a[1], b[0], b[1], true);
      }
    }
    for (const box of sc.boxes) {
      const [x0, y0, x1, y1] = box.r;
      add(x0, y0, x1, y0, box.platform); add(x1, y0, x1, y1, box.platform);
      add(x1, y1, x0, y1, box.platform); add(x0, y1, x0, y0, box.platform);
    }
    return segs;
  }

  // circle body vs static segments (Box2D-like: push out, kill approaching velocity, Coulomb friction)
  function collideCircle(b, segs) {
    const r = b.r;
    for (let iter = 0; iter < 2; iter++) {
      for (const s of segs) {
        const cx = b.x, cy = b.y + b.oy;
        if (cx + r < s.minx || cx - r > s.maxx || cy + r < s.miny || cy - r > s.maxy) continue;
        let t = ((cx - s.ax) * s.dx + (cy - s.ay) * s.dy) / s.len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = s.ax + s.dx * t, qy = s.ay + s.dy * t;
        let nx = cx - qx, ny = cy - qy;
        const d2 = nx * nx + ny * ny;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) { const l = Math.sqrt(s.len2); nx = -s.dy / l; ny = s.dx / l; d = 0; } else { nx /= d; ny /= d; }
        const pen = r - d;
        b.x += nx * pen; b.y += ny * pen;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= vn * nx; b.vy -= vn * ny;
          const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
          const dv = Math.min(Math.abs(vt), FRICTION * -vn);
          b.vx -= sign(vt) * dv * tx; b.vy -= sign(vt) * dv * ty;
        }
      }
    }
  }

  function circleHitsSegments(x, y, r, segs, platformOnly) {
    for (const s of segs) {
      if (platformOnly && !s.platform) continue;
      if (x + r < s.minx || x - r > s.maxx || y + r < s.miny || y - r > s.maxy) continue;
      let t = ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = s.ax + s.dx * t - x, qy = s.ay + s.dy * t - y;
      if (qx * qx + qy * qy < r * r) return true;
    }
    return false;
  }

  // first hit of a ray against segments -> {dist, seg} or null
  function raySegments(ox, oy, dx, dy, maxd, segs) {
    let best = null;
    for (const s of segs) {
      const den = dx * s.dy - dy * s.dx;
      if (Math.abs(den) < 1e-9) continue;
      const wx = s.ax - ox, wy = s.ay - oy;
      const t = (wx * s.dy - wy * s.dx) / den;
      const u = (wx * dy - wy * dx) / den;
      if (t >= 0 && t <= maxd && u >= 0 && u <= 1 && (!best || t < best.dist)) best = { dist: t, seg: s };
    }
    return best;
  }
  // ray (horizontal or any) vs axis-aligned box -> distance or Infinity
  function rayBox(ox, oy, dx, dy, maxd, x0, y0, x1, y1) {
    let tmin = 0, tmax = maxd;
    for (const [o, d, a, b] of [[ox, dx, x0, x1], [oy, dy, y0, y1]]) {
      if (Math.abs(d) < 1e-9) { if (o < a || o > b) return Infinity; continue; }
      let t1 = (a - o) / d, t2 = (b - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
    return tmin;
  }
  const circleBox = (cx, cy, r, x0, y0, x1, y1) => {
    const qx = clamp(cx, x0, x1), qy = clamp(cy, y0, y1);
    const dx = cx - qx, dy = cy - qy;
    return { hit: dx * dx + dy * dy < r * r, qx, qy, dx, dy };
  };

  /* ------------------------------------------------------------------ entities */
  class Health {
    constructor(hp) { this.health = hp; this.maxHealth = hp; this.isDead = false; this.isDamaged = false; }
    takeDamage(n) {
      if (this.isDamaged) return;
      this.health -= n;
      if (this.health <= 0) this.isDead = true; else this.isDamaged = true;
    }
  }

  class Player {
    constructor(spec, world) {
      this.w = world;
      this.x = this.px = spec.x; this.y = this.py = spec.y;
      this.vx = 0; this.vy = 0;
      this.scale = spec.scale;            // 4.01 (sign = facing)
      this.r = 0.47; this.oy = 0;         // capsule 0.92 x 0.96 ≈ circle
      this.halfW = 0.461;                 // collider half width (0.23 * 4.01 / 2)
      this.gravityScale = 1; this.drag = 1;
      this.hc = new Health(5);
      Object.assign(this, {
        MAX_JUMPS: 2, aerialControl: 0.01, wallPushForce: 100, jumpForce: 7, runForce: 10, maxSpeed: 5,
        wallSlidingSpeed: 0, maxFallingSpeed: 10, dashingPower: 6, dashingTime: 0.2, dashingCooldown: 1,
        damageTime: 1, deathTime: 1, meleeAttackTime: 0.5, meleeAttackRange: 2, meleeAttackStrength: 1, damageKnockback: 50,
        isFacingRight: true, isFacingCorrectDirection: true, isTouchingWall: false, isGrounded: true, isSliding: false,
        isWallJumping: false, isDashing: false, canDash: true, canAttack: true, isAttacking: false, animatingDamage: false,
        jumpCounter: 0, moveHorizontal: 0, spacePressed: false, isHorizontalInput: false,
      });
      this.anim = "player-idle"; this.animT = 0;
      this.trail = []; this.trailOn = false;
      this.timers = [];
      this.sound = { running: false, sliding: false, falling: false };
    }
    wait(sec, fn) { this.timers.push({ t: sec, fn }); }
    tickTimers(dt) {
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const tm = this.timers[i];
        tm.t -= dt;
        if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
      }
    }
    get facing() { return unitySign(this.scale); }
    flip() { this.scale *= -1; this.isFacingRight = !this.isFacingRight; }

    grounded() { return circleHitsSegments(this.x, this.y - 0.1, this.r - 0.05, this.w.segs, true); }
    wallCheck() {
      const dir = this.isFacingRight ? 1 : -1;
      const hit = raySegments(this.x, this.y, dir, 0, this.halfW + 0.4, this.w.segs);
      return !!(hit && hit.seg.platform);
    }
    facingCorrectDirection() { return !(this.moveHorizontal * this.scale < 0); }
    jumpIfSpacePressed(fx, fy) {
      if (this.spacePressed && this.jumpCounter < this.MAX_JUMPS) {
        this.vx += fx; this.vy += fy; // ForceMode2D.Impulse, mass 1
        this.spacePressed = false;
        this.jumpCounter++;
      }
    }
    moveHorizontally(control) { if (this.isHorizontalInput) this.vx += control * this.moveHorizontal * this.runForce; }
    capVelocity() {
      this.vx = sign(this.vx) * Math.min(Math.abs(this.vx), this.maxSpeed);
      if (!this.isGrounded) this.vy = Math.max(this.vy, -this.maxFallingSpeed);
    }

    update() {
      // PlayerController.Update
      if (this.animatingDamage || this.isAttacking || this.isDashing) return;
      if (this.hc.isDamaged) this.damage();
      else if (this.hc.isDead) this.die();
      if (pressed.jump) this.spacePressed = true;
      if (pressed.dash && this.canDash) this.dash();
      if (pressed.attack && this.canAttack) this.attack();
    }
    fixedUpdate() {
      if (this.hc.isDamaged || this.isAttacking || this.hc.isDead || this.isDashing) return;
      this.moveHorizontal = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      this.isGrounded = this.grounded();
      this.isTouchingWall = this.wallCheck();
      this.isFacingCorrectDirection = this.facingCorrectDirection();
      this.isWallJumping = this.isSliding && this.spacePressed;
      this.isSliding = this.isTouchingWall && this.isFacingCorrectDirection;
      this.isHorizontalInput = Math.abs(this.moveHorizontal) > 0.1;
      if (!this.isFacingCorrectDirection) this.flip();
      if (this.isWallJumping) {
        this.flip();
        this.jumpIfSpacePressed(this.scale * this.wallPushForce, this.jumpForce);
        this.isSliding = false; this.isWallJumping = false;
      } else if (this.isGrounded) {
        this.jumpCounter = 0;
        this.moveHorizontally(1);
        this.jumpIfSpacePressed(0, this.jumpForce);
      } else if (this.isSliding) {
        this.jumpCounter = 1;
        this.vy = clamp(this.vy, -this.wallSlidingSpeed, Infinity);
      } else {
        this.moveHorizontally(this.aerialControl);
        this.jumpIfSpacePressed(0, this.jumpForce);
      }
      this.capVelocity();
    }
    dash() {
      if (this.isSliding) return;
      this.canDash = false; this.isDashing = true;
      const g = this.gravityScale; this.gravityScale = 0;
      this.vx = this.scale * this.dashingPower; this.vy = 0;
      this.trailOn = true;
      sfx("whoosh-transitions-sfx-03-118230");
      this.wait(this.dashingTime, () => {
        this.trailOn = false; this.gravityScale = g; this.isDashing = false;
        this.wait(this.dashingCooldown, () => (this.canDash = true));
      });
    }
    attack() {
      if (this.isSliding) return;
      this.canAttack = false; this.isAttacking = true;
      sfx("slash-21834");
      // melee: first collider in front of the player within range (the original ray started inside the
      // player's own collider and so never reached an enemy; this version hits as intended)
      const dir = this.facing;
      const ox = this.x + dir * this.halfW, oy = this.y;
      const wall = raySegments(ox, oy, dir, 0, this.meleeAttackRange, this.w.segs);
      let best = wall ? wall.dist : Infinity, target = null;
      for (const u of this.w.umibozu) {
        if (u.removed) continue;
        const b = u.bounds();
        const d = rayBox(ox, oy, dir, 0, this.meleeAttackRange, b[0], b[1], b[2], b[3]);
        if (d < best) { best = d; target = u; }
      }
      if (target) {
        target.hc.takeDamage(this.meleeAttackStrength);
        target.vx += target.scale * this.damageKnockback * DT; // AddForce(ForceMode2D.Force) for one step
      }
      this.wait(this.meleeAttackTime, () => { this.canAttack = true; this.isAttacking = false; });
    }
    damage() {
      this.animatingDamage = true;
      sfx("hurt_c_08-102842");
      this.wait(this.damageTime, () => { this.hc.isDamaged = false; this.animatingDamage = false; });
    }
    die() {
      this.animatingDamage = true;
      sfx("pixel-death-66829");
      this.wait(this.deathTime, () => { this.removed = true; loadScene(1); });
    }
    step(h) {
      this.vy += GRAVITY * this.gravityScale * h;
      const k = 1 / (1 + h * this.drag);
      this.vx *= k; this.vy *= k;
      this.x += this.vx * h; this.y += this.vy * h;
      collideCircle(this, this.w.segs);
    }
    animate(dt) {
      // PlayerAnimation.Update
      let s;
      if (this.hc.isDamaged || this.hc.isDead) s = "player-damage";
      else if (this.isDashing) s = "player-jump";
      else if (this.isAttacking) s = "player-damage";
      else if (this.isGrounded) s = this.isHorizontalInput ? "player-run" : "player-idle";
      else if (this.isSliding) s = "player-slide";
      else s = this.vy > 0 ? "player-jump" : "player-fall";
      if (s !== this.anim) { this.anim = s; this.animT = 0; } else this.animT += dt;
      // PlayerAudio (looping versions of the per-frame Play() calls)
      const alive = !this.hc.isDamaged && !this.hc.isDead && !this.isDashing && !this.isAttacking;
      loopSet("p-run", "running-in-grass-6237", alive && this.isGrounded && this.isHorizontalInput ? 0.5 * SFX_GAIN : 0);
      loopSet("p-slide", "snow-crunch-127203_3kjcI3KU", alive && !this.isGrounded && this.isSliding ? 0.6 * SFX_GAIN : 0);
      const fallingNow = alive && !this.isGrounded && !this.isSliding && this.vy <= 0;
      loopSet("p-fall", "monologue-wind-60484", fallingNow ? 0.35 * SFX_GAIN : 0);
      const jumpingNow = alive && !this.isGrounded && !this.isSliding && this.vy > 0;
      if (jumpingNow && !this.sound.jumping) sfx("fast-simple-chop-5-6270", 0.7);
      this.sound.jumping = jumpingNow;
      // trail
      const now = performance.now() / 1000;
      if (this.trailOn) this.trail.push({ x: this.x, y: this.y, t: now });
      while (this.trail.length && now - this.trail[0].t > 0.5) this.trail.shift();
    }
  }

  class Umibozu {
    constructor(spec, world) {
      this.w = world;
      this.x = this.px = spec.x; this.y = this.py = spec.y;
      this.vx = 0; this.vy = 0;
      this.scale = spec.scale;                    // 0.5
      this.box = spec.box;                        // collider bounds (unflipped, relative)
      this.r = spec.box.h / 2; this.oy = spec.box.cy;
      this.start = spec.start; this.end = spec.end;
      this.currentPoint = this.end;
      Object.assign(this, { speed: 3, chargeStrength: 40, visibility: 10, damageKnockback: 100, damageStrength: 1, chargeTime: 0.1, chargeCooldown: 2, damageTime: 1, deathTime: 1 });
      this.hc = new Health(3);
      this.canCharge = true; this.isAttacking = false; this.animatingDamage = false;
      this.timers = []; this.trail = []; this.trailOn = false;
      this.touching = false;
      this.anim = "umibozu-walk"; this.animT = 0; this.walkClip = "umibozu-walk";
      this.key = "u" + Math.random();
    }
    wait(sec, fn) { this.timers.push({ t: sec, fn }); }
    tickTimers(dt) { Player.prototype.tickTimers.call(this, dt); }
    bounds() {
      const s = unitySign(this.scale);
      const cx = this.x + this.box.cx * s, cy = this.y + this.box.cy;
      return [cx - this.box.w / 2, cy - this.box.h / 2, cx + this.box.w / 2, cy + this.box.h / 2];
    }
    flip() {
      if (sign(this.currentPoint[0] - this.x) * this.scale < 0) this.scale *= -1;
    }
    checkForPlayer() {
      const p = this.w.player;
      if (!p || p.removed) return false;
      const dir = unitySign(this.scale);
      const ox = this.x + this.box.cx * dir + dir * (this.box.w / (Math.abs(this.scale) * 2) + 0.01);
      const oy = this.y + this.box.cy;
      return rayBox(ox, oy, dir, 0, this.visibility, p.x - p.halfW, p.y - 0.48, p.x + p.halfW, p.y + 0.48) < Infinity;
    }
    fixedUpdate() {
      if (this.animatingDamage || this.isAttacking) return;
      if (this.hc.isDamaged) {
        this.animatingDamage = true;
        this.wait(this.damageTime, () => { this.hc.isDamaged = false; this.animatingDamage = false; });
      } else if (this.hc.isDead) {
        this.animatingDamage = true;
        this.wait(this.deathTime, () => { this.removed = true; loopSet(this.key, "", 0); });
      }
      if (this.canCharge && this.checkForPlayer()) {
        this.attack();
      } else {
        this.flip();
        this.vx = this.scale * this.speed; this.vy = 0;
        this.isAttacking = false;
      }
      if (Math.hypot(this.x - this.currentPoint[0], this.y - this.currentPoint[1]) < this.speed) {
        this.currentPoint = this.currentPoint === this.end ? this.start : this.end;
        this.flip();
      }
    }
    attack() {
      this.canCharge = false; this.isAttacking = true;
      this.trailOn = true;
      this.vx = this.scale * this.chargeStrength; this.vy = 0;
      this.wait(this.chargeTime, () => {
        this.trailOn = false; this.isAttacking = false;
        this.wait(this.chargeCooldown, () => (this.canCharge = true));
      });
    }
    step(h) {
      this.vy += GRAVITY * h;
      this.x += this.vx * h; this.y += this.vy * h;
      collideCircle(this, this.w.segs);
    }
    animate(dt) {
      if (!this.hc.isDamaged && !this.hc.isDead) {
        if (this.isAttacking) { this.walkClip = "umibozu-charge"; } // the original permanently switches to the angry face
        const s = this.isAttacking ? "umibozu-charge" : this.walkClip;
        if (s !== this.anim) { this.anim = s; this.animT = 0; } else this.animT += dt;
        if (this.isAttacking && !this.chargeSoundPlayed) { this.chargeSoundPlayed = true; sfx("umibozu-charge", proximity(this) ); }
        if (!this.isAttacking) this.chargeSoundPlayed = false;
      }
      loopSet(this.key, "umibozu-walk", this.removed || this.hc.isDead ? 0 : 0.5 * SFX_GAIN * proximity(this));
      const now = performance.now() / 1000;
      if (this.trailOn) this.trail.push({ x: this.x, y: this.y + this.box.cy, t: now });
      while (this.trail.length && now - this.trail[0].t > 0.1) this.trail.shift();
    }
  }

  class Raven {
    constructor(spec, world) {
      this.w = world;
      this.x = spec.x; this.y = spec.y; this.scale = 1;
      this.bulletLocal = [spec.bullet[0] - spec.x, spec.bullet[1] - spec.y];
      Object.assign(this, { attackDelay: 0.5, range: 10, timer: 0, isAttacking: false });
      this.anim = "raven-fly"; this.animT = 0;
      this.key = "r" + Math.random();
    }
    update(dt) {
      const p = this.w.player;
      if (!p) return;
      if (-sign(p.x - this.x) * this.scale < 0) this.scale *= -1;      // Flip()
      if (Math.hypot(p.x - this.x, p.y - this.y) < this.range) {
        this.isAttacking = true;
        this.timer += dt;
        if (this.timer > this.attackDelay) { this.timer = 0; this.shoot(); }
      } else this.isAttacking = false;
    }
    shoot() {
      if (!this.launch || this.launch.ended || this.launch.paused) this.launch = sfx("eagle-scream-112940", 0.5 * proximity(this));
      this.w.spawnBullet(this.x + this.bulletLocal[0] * this.scale, this.y + this.bulletLocal[1], 5, 7);
    }
    animate(dt) {
      const s = this.isAttacking ? "raven-attack" : "raven-fly";
      if (s !== this.anim) { this.anim = s; this.animT = 0; } else this.animT += dt;
      loopSet(this.key, "raven-fly", 0.45 * SFX_GAIN * proximity(this));
    }
  }

  class Boss {
    constructor(spec, world) {
      this.w = world;
      this.x = spec.x; this.y = spec.y;
      this.scale = spec.scale; this.box = spec.box;
      this.bulletLocal = [(spec.bullet[0] - spec.x) / spec.scale, (spec.bullet[1] - spec.y) / spec.scale];
      Object.assign(this, { maxSpeed: 3, damageStrength: 1, damageTime: 1, deathTime: 1, collisionKnockback: 50, attackDelay: 1.5, timer: 0 });
      this.hc = new Health(5);
      this.animatingDamage = false; this.timers = []; this.touching = false;
      this.anim = "apollo-fight"; this.animT = 0;
    }
    wait(sec, fn) { this.timers.push({ t: sec, fn }); }
    tickTimers(dt) { Player.prototype.tickTimers.call(this, dt); }
    bounds() {
      const s = unitySign(this.scale);
      const cx = this.x + this.box.cx * s, cy = this.y + this.box.cy;
      return [cx - this.box.w / 2, cy - this.box.h / 2, cx + this.box.w / 2, cy + this.box.h / 2];
    }
    fixedUpdate() {
      // The original picks Random.Range(-Infinity, Infinity) for its velocity, which Unity rejects,
      // so Apollo hovers in place; he turns to face the player and fires a note every attackDelay.
      if (this.animatingDamage) return;
      const p = this.w.player;
      if (p && sign(p.x - this.x) * this.scale < 0) this.scale *= -1;
      if (this.hc.isDamaged) {
        this.animatingDamage = true;
        this.wait(this.damageTime, () => { this.hc.isDamaged = false; this.animatingDamage = false; });
        return;
      }
      if (this.hc.isDead) {
        this.animatingDamage = true;
        this.wait(this.deathTime, () => { this.removed = true; loadScene(5); });
        return;
      }
      this.timer += DT;
      if (this.timer > this.attackDelay) {
        this.timer = 0;
        this.w.spawnBullet(this.x + this.bulletLocal[0] * this.scale, this.y + this.bulletLocal[1] * Math.abs(this.scale), 3, 3);
      }
    }
    animate(dt) { this.animT += dt; }
  }

  class Bullet {
    constructor(x, y, force, lifetime, world) {
      this.x = this.px = x; this.y = this.py = y;
      const p = world.player;
      const dx = p.x - x, dy = p.y - y, l = Math.hypot(dx, dy) || 1;
      this.vx = (dx / l) * force; this.vy = (dy / l) * force;
      this.lifetime = lifetime; this.timer = 0;
      this.hw = (D.bullet.box.x * D.bullet.scale[0]) / 2; this.hh = (D.bullet.box.y * D.bullet.scale[1]) / 2;
      this.animT = 0;
    }
  }

  const proximity = (e) => {
    const p = world && world.player;
    if (!p) return 0;
    return clamp(1 - Math.hypot(e.x - p.x, e.y - p.y) / 18, 0, 1);
  };

  /* ------------------------------------------------------------------ level world */
  let world = null;
  class World {
    constructor(sc) {
      this.sc = sc;
      this.segs = makeSegments(sc);
      this.player = new Player(sc.player, this);
      this.umibozu = sc.umibozu.map((u) => new Umibozu(u, this));
      this.ravens = sc.ravens.map((r) => new Raven(r, this));
      this.boss = sc.boss ? new Boss(sc.boss, this) : null;
      this.bullets = [];
      this.cam = { x: sc.camera.x, y: sc.camera.y, px: sc.camera.x, py: sc.camera.y, size: sc.camera.size };
      this.bulletSound = 0;
      this.time = 0;
    }
    spawnBullet(x, y, force, lifetime) {
      if (!this.player || this.player.removed) return;
      this.bullets.push(new Bullet(x, y, force, lifetime, this));
      // BulletAudio plays a 12 s chord sweep per note; keep it to one at a time so it stays musical
      if (!this.bulletSound || this.bulletSound.ended || this.bulletSound.paused) this.bulletSound = sfx("sp_chord-sweep_major_d_125-95877", 0.25);
    }
    tick() {
      const p = this.player;
      this.time += DT;
      // --- Update()
      if (!p.removed) { p.tickTimers(DT); p.update(); }
      for (const r of this.ravens) r.update(DT);
      for (const u of this.umibozu) if (!u.removed) u.tickTimers(DT);
      if (this.boss && !this.boss.removed) this.boss.tickTimers(DT);
      pressed.jump = pressed.dash = pressed.attack = false;
      // --- FixedUpdate()
      if (!p.removed) p.fixedUpdate();
      for (const u of this.umibozu) if (!u.removed) u.fixedUpdate();
      if (this.boss && !this.boss.removed) this.boss.fixedUpdate();
      // --- physics
      p.px = p.x; p.py = p.y;
      for (const u of this.umibozu) { u.px = u.x; u.py = u.y; }
      const h = DT / SUBSTEPS;
      for (let i = 0; i < SUBSTEPS; i++) {
        if (!p.removed) p.step(h);
        for (const u of this.umibozu) if (!u.removed) u.step(h);
        this.solveDynamic();
      }
      // bullets (triggers, no gravity)
      for (const b of this.bullets) {
        b.px = b.x; b.py = b.y;
        b.x += b.vx * DT; b.y += b.vy * DT;
        b.timer += DT; b.animT += DT;
        if (b.timer > b.lifetime) b.dead = true;
        if (!b.dead && !p.removed && circleBox(p.x, p.y, p.r, b.x - b.hw, b.y - b.hh, b.x + b.hw, b.y + b.hh).hit) {
          p.hc.takeDamage(1);
          b.dead = true;
        }
      }
      this.bullets = this.bullets.filter((b) => !b.dead);
      this.umibozu = this.umibozu.filter((u) => !u.removed);
      // triggers: kill zones (LevelController) and the Oracle
      const inside = (x, y, r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
      for (const k of this.sc.kill) {
        if (!p.removed && inside(p.x, p.y - p.r, k) && !p.inKill) { p.inKill = true; p.hc.takeDamage(p.hc.health); }
        for (const u of this.umibozu) if (inside(u.x, u.y, k) && !u.inKill) { u.inKill = true; u.hc.takeDamage(u.hc.health); }
      }
      if (!p.removed && !p.hc.isDead && p.y < -60) p.hc.takeDamage(99), (p.hc.isDamaged = false), (p.hc.isDead = true);
      for (const o of this.sc.oracle) if (!p.removed && !p.hc.isDead && inside(p.x, p.y, o)) { loadScene(sceneIndex + 1); return; }
      this.updateCamera(DT);
    }
    // player vs Umibozu / Apollo (solid contacts + OnCollisionEnter2D)
    solveDynamic() {
      const p = this.player;
      if (p.removed) return;
      for (const u of this.umibozu) {
        if (u.removed) continue;
        const b = u.bounds();
        const c = circleBox(p.x, p.y, p.r + 0.01, b[0], b[1], b[2], b[3]);
        if (c.hit) {
          if (!u.touching) {
            u.touching = true;
            // OnCollisionEnter2D: knockback goes to the Umibozu's own rigidbody (Collision2D.otherRigidbody)
            u.vx += sign(p.x - u.x) * u.damageKnockback * DT;
            p.hc.takeDamage(u.damageStrength);
          }
          let d = Math.hypot(c.dx, c.dy), nx, ny;
          if (d < 1e-6) { nx = sign(p.x - (b[0] + b[2]) / 2) || 1; ny = 0; d = 0; } else { nx = c.dx / d; ny = c.dy / d; }
          const pen = p.r - d;
          if (pen > 0) {
            p.x += nx * pen * 0.5; p.y += ny * pen * 0.5; u.x -= nx * pen * 0.5;
            const rv = (p.vx - u.vx) * nx + p.vy * ny;
            if (rv < 0) { p.vx -= rv * nx * 0.5; p.vy -= rv * ny * 0.5; u.vx += rv * nx * 0.5; }
          }
        } else u.touching = false;
      }
      const boss = this.boss;
      if (boss && !boss.removed) {
        const b = boss.bounds();
        const c = circleBox(p.x, p.y, p.r + 0.01, b[0], b[1], b[2], b[3]);
        if (c.hit) {
          if (!boss.touching) {
            boss.touching = true;
            if (p.isDashing) boss.hc.takeDamage(1);
            else p.hc.takeDamage(boss.damageStrength);
          }
          let d = Math.hypot(c.dx, c.dy), nx, ny;
          if (d < 1e-6) { nx = sign(p.x - (b[0] + b[2]) / 2) || 1; ny = 0; d = 0; } else { nx = c.dx / d; ny = c.dy / d; }
          const pen = p.r - d;
          if (pen > 0) {
            p.x += nx * pen; p.y += ny * pen;
            const vn = p.vx * nx + p.vy * ny;
            if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
          }
        } else boss.touching = false;
      }
    }
    // Cinemachine framing transposer: damping 1, dead zone 3% x 90%, soft zone 80% x 90%
    updateCamera(dt) {
      const c = this.cam, p = this.player;
      c.px = c.x; c.py = c.y;
      if (!this.sc.camera.follow || p.removed) return;
      const halfH = c.size, halfW = c.size * (W / H);
      const damp = 1 - Math.exp((-4.6 * dt) / 1);
      const axis = (pos, cam, half, dead, soft, damping) => {
        const off = pos - cam, dz = dead * half, sz = soft * half;
        let target = cam;
        if (off > dz) target = cam + (off - dz); else if (off < -dz) target = cam + (off + dz);
        let next = cam + (target - cam) * damping;
        const o2 = pos - next;
        if (o2 > sz) next = pos - sz; else if (o2 < -sz) next = pos + sz;
        return next;
      };
      c.x = axis(p.x, c.x, halfW, 0.03, 0.8, damp);
      c.y = axis(p.y, c.y, halfH, 0.9, 0.9, 1);
    }
  }

  /* ------------------------------------------------------------------ rendering */
  function drawSprite(name, wx, wy, scaleX, scaleY, view, alpha = 1) {
    const sp = D.sprites[name];
    if (!sp) return;
    const im = IMG[sp.img];
    if (!im || !im.el.complete || !im.el.naturalWidth) return;
    const k = im.w / im.texW; // downscaled texture factor
    const [rx, ry, rw, rh] = sp.rect;
    const ww = (rw / sp.ppu) * Math.abs(scaleX), wh = (rh / sp.ppu) * Math.abs(scaleY);
    // pivot is normalised in the sprite rect (Unity: origin bottom-left)
    const px = sp.pivot[0], py = sp.pivot[1];
    const sx = view.sx(wx), sy = view.sy(wy), ppu = view.ppu;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = !im.pixel;
    ctx.translate(sx, sy);
    if (scaleX < 0) ctx.scale(-1, 1);
    ctx.drawImage(im.el, rx * k, ry * k, rw * k, rh * k, -px * ww * ppu, -(1 - py) * wh * ppu, ww * ppu, wh * ppu);
    ctx.restore();
  }
  function drawTrail(pts, view, width, life, color) {
    if (pts.length < 2) return;
    const now = performance.now() / 1000;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const f = clamp(1 - (now - b.t) / life, 0, 1);
      ctx.strokeStyle = color.replace("A", (0.6 * f).toFixed(3));
      ctx.lineWidth = width * view.ppu * f;
      ctx.beginPath(); ctx.moveTo(view.sx(a.x), view.sy(a.y)); ctx.lineTo(view.sx(b.x), view.sy(b.y)); ctx.stroke();
    }
    ctx.restore();
  }

  function renderWorld(alpha) {
    const w = world, sc = w.sc, c = w.cam;
    const camX = c.px + (c.x - c.px) * alpha, camY = c.py + (c.y - c.py) * alpha;
    const ppu = H / (2 * c.size);
    const view = { ppu, sx: (x) => (x - camX) * ppu + W / 2, sy: (y) => H / 2 - (y - camY) * ppu };
    const [r, g, b] = sc.camera.bg;
    ctx.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`;
    ctx.fillRect(0, 0, W, H);
    const lerp = (e) => [e.px + (e.x - e.px) * alpha, e.py + (e.y - e.py) * alpha];
    const art = sc.art.slice().sort((a, b) => a.order - b.order);
    // sorting order 0: oracle, characters; order 1: level art (drawn on top, as in the original)
    for (const a of art) if (a.order <= 0) drawSprite(a.sprite, a.x, a.y, a.sx, a.sy, view);
    for (const rv of w.ravens) drawSprite(clipFrame(rv.anim, rv.animT), rv.x, rv.y, rv.scale, 1, view);
    for (const u of w.umibozu) {
      drawTrail(u.trail, view, 1.2, 0.1, "rgba(160,230,255,A)");
      const [x, y] = lerp(u);
      drawSprite(clipFrame(u.anim, u.animT), x, y, u.scale, Math.abs(u.scale), view, u.hc.isDamaged || u.hc.isDead ? 0.55 + 0.45 * Math.sin(w.time * 40) : 1);
    }
    if (w.boss && !w.boss.removed) {
      const bs = w.boss;
      drawSprite(clipFrame("apollo-fight", bs.animT), bs.x, bs.y, bs.scale, Math.abs(bs.scale), view, bs.hc.isDamaged || bs.hc.isDead ? 0.5 + 0.5 * Math.sin(w.time * 40) : 1);
    }
    const p = w.player;
    if (!p.removed) {
      drawTrail(p.trail, view, 0.8, 0.5, "rgba(255,255,255,A)");
      const [x, y] = lerp(p);
      drawSprite(clipFrame(p.anim, p.animT), x, y, p.scale, Math.abs(p.scale), view);
    }
    for (const bl of w.bullets) {
      const [x, y] = lerp(bl);
      drawSprite(clipFrame("bullet-idle", bl.animT), x, y, D.bullet.scale[0], D.bullet.scale[1], view);
    }
    for (const a of art) if (a.order > 0) drawSprite(a.sprite, a.x, a.y, a.sx, a.sy, view);
    // hearts (HealthUIController)
    const hs = Math.round(Math.min(W, H) * 0.06);
    for (let i = 0; i < p.hc.maxHealth; i++) {
      const name = i < p.hc.health ? "heart_animated_1_0" : "heart_animated_1_4";
      const sp = D.sprites[name], im = IMG[sp.img];
      if (!im || !im.el.naturalWidth) continue;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(im.el, sp.rect[0], sp.rect[1], sp.rect[2], sp.rect[3], 16 * DPR + i * (hs + 6 * DPR), 14 * DPR, hs, hs);
    }
    // first-level controls hint
    if (sceneIndex === 2 && w.time < 7) {
      ctx.save();
      ctx.globalAlpha = clamp(7 - w.time, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      const text = isTouch ? "◀ ▶ move · ⤒ jump (twice) · DASH · HIT" : "A/D or ←/→ move · SPACE jump (double, wall-jump) · SHIFT dash · CLICK or J attack";
      ctx.font = `600 ${Math.round(14 * DPR)}px Arial, sans-serif`;
      const tw = ctx.measureText(text).width;
      const hy = 14 * DPR + hs + 14 * DPR;
      ctx.fillRect(W / 2 - tw / 2 - 14 * DPR, hy, tw + 28 * DPR, 34 * DPR);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, W / 2, hy + 17 * DPR);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ menus (1920x1080 canvas layout) */
  let menu = null;
  class Menu {
    constructor(spec) { this.spec = spec; this.hover = false; }
    layout() {
      const s = Math.min(W / 1920, H / 1080);
      return { s, cx: W / 2, cy: H / 2, X: (x) => W / 2 + x * s, Y: (y) => H / 2 - y * s };
    }
    buttonRect() {
      const L = this.layout(), b = this.spec.button;
      return [L.X(b.x) - (b.w * L.s) / 2, L.Y(b.y) - (b.h * L.s) / 2, b.w * L.s, b.h * L.s];
    }
    activate() { this.spec.onClick(); }
    draw() {
      const L = this.layout();
      ctx.fillStyle = "rgb(49,77,121)";
      ctx.fillRect(0, 0, W, H);
      for (const im of this.spec.images) {
        const sp = D.sprites[im.sprite];
        const I = sp && IMG[sp.img];
        if (!I || !I.el.naturalWidth) continue;
        const k = I.w / I.texW;
        // anchorRight: positioned from the right edge of the 1920-wide reference canvas
        const px = im.anchorRight ? L.X(960 + im.x) : L.X(im.x);
        ctx.imageSmoothingEnabled = !I.pixel;
        ctx.drawImage(I.el, sp.rect[0] * k, sp.rect[1] * k, sp.rect[2] * k, sp.rect[3] * k, px - (im.w * L.s) / 2, L.Y(im.y) - (im.h * L.s) / 2, im.w * L.s, im.h * L.s);
      }
      for (const t of this.spec.texts) {
        ctx.save();
        ctx.fillStyle = t.color || "#fff";
        ctx.font = `${t.bold ? "700" : "400"} ${Math.round(t.size * L.s)}px "Liberation Sans", Arial, Helvetica, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 12 * L.s;
        ctx.fillText(t.text, L.X(t.x), L.Y(t.y));
        ctx.restore();
      }
      const [bx, by, bw, bh] = this.buttonRect();
      ctx.save();
      ctx.fillStyle = this.hover ? "#e8ecff" : "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 10 * L.s;
      roundRect(bx, by, bw, bh, 10 * L.s); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgb(50,50,50)";
      ctx.font = `400 ${Math.round(this.spec.button.size * L.s)}px "Liberation Sans", Arial, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(this.spec.button.text, bx + bw / 2, by + bh / 2 + 2 * L.s);
      ctx.restore();
      if (this.spec.footer) {
        ctx.save();
        const fs = Math.round(Math.max(10 * DPR, 18 * L.s));
        ctx.font = `400 ${fs}px Arial, sans-serif`;
        const tw = Math.min(W - 16 * DPR, ctx.measureText(this.spec.footer).width + 24 * DPR);
        ctx.fillStyle = "rgba(10,20,45,0.6)";
        roundRect(W / 2 - tw / 2, H - fs - 22 * DPR, tw, fs + 14 * DPR, 6 * DPR); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(this.spec.footer, W / 2, H - fs / 2 - 15 * DPR, W - 32 * DPR);
        ctx.restore();
      }
    }
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const MENUS = {
    0: {
      images: [
        { sprite: "level 3", x: -48, y: 65, w: 2017, h: 1371 },
        { sprite: "level-3-platform", x: -665, y: -330, w: 1806, h: 1131 },
        { sprite: "level-3-platform", x: -683, y: 358, w: 1466, h: 858 },
        { sprite: "orade", x: 0, y: 19, w: 944, h: 1042 },
        { sprite: "umibozu angry 1", x: 696, y: -424, w: 786, h: 599 },
        { sprite: "raven open angry", x: 700, y: 402, w: 645, h: 576 },
        { sprite: "Apallo- 2", x: -581, y: -73, w: 1143, h: 1151, anchorRight: true },
        { sprite: "Jump (32x32)", x: -533, y: -70, w: 433, h: 392 },
      ],
      texts: [{ text: "NIMBUS", x: 0, y: 370, size: 192, bold: true, color: "rgb(105,120,255)" }],
      button: { text: "Start", x: 0, y: -138, w: 318, h: 82, size: 49 },
      onClick: () => loadScene(2),
      footer: "Ninja Frog: Pixel Adventure by Pixel Frog · Sounds & music: Pixabay, vitalezzz (Orbital Graveyard, Modanung remix)",
    },
    1: {
      images: [{ sprite: "Apallo- 2", x: 660, y: -227, w: 1106, h: 1038 }],
      texts: [{ text: "You Died", x: 0, y: 185, size: 210 }],
      button: { text: "Restart", x: 0, y: -178, w: 393, h: 117, size: 62 },
      onClick: () => loadScene(0),
    },
    5: {
      images: [{ sprite: "Fall (32x32)", x: -569, y: -237, w: 427, h: 406 }],
      texts: [{ text: "You Win", x: 0, y: 373, size: 110 }, { text: "You made it rain!", x: 0, y: 159, size: 71 }],
      button: { text: "Restart", x: 0, y: -154, w: 352, h: 129, size: 69 },
      onClick: () => loadScene(0),
    },
  };

  const toCanvas = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * DPR, (e.clientY - r.top) * DPR]; };
  const inRect = ([x, y], [rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
  canvas.addEventListener("pointermove", (e) => { if (menu) { menu.hover = inRect(toCanvas(e), menu.buttonRect()); canvas.style.cursor = menu.hover ? "pointer" : "default"; } });
  canvas.addEventListener("pointerdown", (e) => {
    canvas.focus();
    if (menu) { if (inRect(toCanvas(e), menu.buttonRect())) menu.activate(); return; }
    if (paused) { setPaused(false); return; }
    if (e.button === 0 && e.pointerType === "mouse") pressed.attack = true; // Input.GetKeyDown(KeyCode.Mouse0)
  });

  /* ------------------------------------------------------------------ scenes */
  let scene = null, sceneIndex = 0;
  function loadScene(i) {
    sceneIndex = i;
    stopAllLoops();
    for (const k in held) held[k] = false;
    pressed.jump = pressed.dash = pressed.attack = false;
    if (MENUS[i]) {
      world = null; scene = null;
      menu = new Menu(MENUS[i]);
      if (music) { music.pause(); music = null; }
      touchEl.classList.remove("on");
    } else {
      menu = null;
      paused = false;
      scene = D.scenes[i];
      world = new World(scene);
      playMusic(scene.music);
      if (isTouch) touchEl.classList.add("on");
    }
    canvas.focus();
  }

  /* ------------------------------------------------------------------ main loop */
  let acc = 0, last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (world && paused) { renderWorld(1); drawPause(); acc = 0; }
    else if (world) {
      acc += dt;
      while (acc >= DT && world) { world.tick(); acc -= DT; }
      if (world) {
        const p = world.player;
        if (!p.removed) p.animate(dt);
        for (const u of world.umibozu) u.animate(dt);
        for (const r of world.ravens) r.animate(dt);
        if (world.boss) world.boss.animate(dt);
        renderWorld(acc / DT);
      }
    }
    if (menu) menu.draw();
    requestAnimationFrame(frame);
  }

  function drawPause() {
    ctx.save();
    ctx.fillStyle = "rgba(10,18,40,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(Math.min(W, H) * 0.09)}px "Liberation Sans", Arial, sans-serif`;
    ctx.fillText("Paused", W / 2, H / 2 - Math.min(W, H) * 0.05);
    ctx.font = `400 ${Math.round(Math.min(W, H) * 0.035)}px Arial, sans-serif`;
    ctx.fillText(isTouch ? "Tap to continue" : "Click, or press P / Esc, to continue", W / 2, H / 2 + Math.min(W, H) * 0.06);
    ctx.restore();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (world) setPaused(true); else if (music) music.pause(); }
    last = performance.now();
  });

  // small hook for automated testing / debugging
  window.NIMBUS = {
    loadScene,
    get world() { return world; },
    get scene() { return sceneIndex; },
    input: { held, pressed },
    tick(n = 1) { for (let i = 0; i < n && world; i++) world.tick(); },
    render() { if (world) renderWorld(1); if (menu) menu.draw(); },
    ready: false,
    get paused() { return paused; },
  };

  loadImages().then(() => {
    loadingEl.remove();
    loadScene(0);
    window.NIMBUS.ready = true;
    requestAnimationFrame(frame);
  });
})();
