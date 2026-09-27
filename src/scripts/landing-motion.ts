import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FRAMES, LOGO_SURFER } from './landing-frames';

gsap.registerPlugin(ScrollTrigger);

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

const PHASE = { hero: 1.5, a: 2.5, white: 0.75, steps: 1.25, rise: 1 };
const START = {
  a: PHASE.hero,
  white: PHASE.hero + PHASE.a,
  steps: PHASE.hero + PHASE.a + PHASE.white,
  rise: PHASE.hero + PHASE.a + PHASE.white + PHASE.steps,
};
const TOTAL = START.rise + PHASE.rise;
const MAX_TILT = 20;
const FOOTER_H = 96;
const PIN_QUERY = '(min-width: 900px) and (prefers-reduced-motion: no-preference)';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (p: Pt, q: Pt, t: number): Pt => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
const bump = (v: number, a: number, b: number) => (v > a && v < b ? Math.sin(Math.PI * seg(v, a, b)) : 0);
const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const rotateAround = (p: Pt, c: Pt, ang: number): Pt => {
  const s = Math.sin(ang), co = Math.cos(ang), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co };
};
function cubic(q: Pt[], t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * q[0].x + 3 * u * u * t * q[1].x + 3 * u * t * t * q[2].x + t * t * t * q[3].x,
    y: u * u * u * q[0].y + 3 * u * u * t * q[1].y + 3 * u * t * t * q[2].y + t * t * t * q[3].y,
  };
}
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Frame schedule for Sequence A: [start, frame].
const FRAMES_A: [number, number][] = [[0, 0], [0.02, 1], [0.05, 2], [0.08, 3], [0.12, 4], [0.16, 5], [0.2, 6], [0.23, 7], [0.26, 8], [0.28, 9], [0.4, 10], [0.78, 11], [0.88, 0]];
const frameAt = (v: number, table: [number, number][]) => {
  let f = table[0][1];
  for (const [start, frame] of table) if (v >= start) f = frame;
  return f;
};
// While a frame still reuses the F00 artwork, 3D tilt and squash stand in for the missing pose.
const isStandIn = (f: number) => FRAMES[f] === FRAMES[0];

interface Geo {
  W: number; H: number; foot: Box; sL: number; sC: number;
  L: Pt; C: Pt; Cp: Pt; S: Pt; F: Pt; seg1: Pt[]; seg2: Pt[];
  trail: Pt[]; lens: number[]; iS: number; iCp: number; hole: Pt; footTop: number;
}
interface Pose { p: Pt; s: number; frame: number; rz: number; ry: number; sy: number; }

let mm: gsap.MatchMedia | null = null;
let framesReady = false;

async function preloadFrames(base: string) {
  const unique = Array.from(new Set(FRAMES));
  await Promise.all(unique.map((src) => { const img = new Image(); img.src = base + src; return img.decode().catch(() => undefined); }));
  framesReady = true;
}

function setup() {
  mm?.revert();
  mm = null;
  const stage = document.getElementById('stage');
  const hero = document.getElementById('hero');
  const finale = document.getElementById('finale');
  const fnav = document.getElementById('fnav');
  const steps = document.getElementById('steps');
  const halvesEl = document.getElementById('halves');
  const actor = document.getElementById('actor');
  const corner = document.getElementById('corner');
  const cornerType = document.getElementById('corner-type');
  const footSurfer = document.getElementById('foot-surfer');
  const trail = document.getElementById('fx-trail') as SVGPathElement | null;
  const trailInk = document.getElementById('fx-trail-ink') as SVGPathElement | null;
  const trailG = document.getElementById('fx-trail-g');
  const krackleG = document.getElementById('fx-krackle');
  const speedG = document.getElementById('fx-speed');
  const burst = document.getElementById('fx-burst') as SVGPolygonElement | null;
  const fx = document.getElementById('fx') as SVGSVGElement | null;
  const warp = document.getElementById('bh-warp-map');
  if (!stage || !hero || !finale || !steps || !halvesEl || !actor || !corner || !cornerType || !footSurfer || !trail || !trailInk || !trailG || !krackleG || !speedG || !burst || !fx || !warp) return;

  const base = (stage.dataset.base ?? '/').replace(/\/?$/, '/');
  void preloadFrames(base);
  const imgs = Array.from(actor.querySelectorAll<HTMLImageElement>('img'));
  const poseFound = actor.querySelector<HTMLElement>('.actor__pose');
  if (!poseFound) return;
  const poseEl: HTMLElement = poseFound;
  const num = actor.querySelector<HTMLElement>('.actor__num');
  if (new URLSearchParams(location.search).get('frames') === 'debug') actor.dataset.debug = '1';

  mm = gsap.matchMedia();
  mm.add(PIN_QUERY, () => {
    stage.classList.add('is-pinned');

    // Yellow halves: two inert copies of the hero, clipped either side of the tear.
    halvesEl.innerHTML = '';
    const halves = ['l', 'r'].map((side) => {
      const half = document.createElement('div');
      half.className = `half half--${side}`;
      for (const a of Array.from(hero.parentElement!.attributes)) if (a.name.startsWith('data-astro-cid')) half.setAttribute(a.name, a.value);
      const clone = hero.cloneNode(true) as HTMLElement;
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      clone.style.setProperty('--p', '1');
      half.appendChild(clone);
      halvesEl.appendChild(half);
      return half;
    });
    halvesEl.setAttribute('aria-hidden', 'true');
    halvesEl.inert = true;

    // Krackle dots (fixed seed so they always land the same way).
    krackleG.innerHTML = '';
    const r = rng(91021);
    const dots = Array.from({ length: 110 }, () => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      krackleG.appendChild(c);
      return { el: c, side: r() < 0.5 ? -1 : 1, along: 0.04 + r() * 0.92, off: Math.pow(r(), 1.6), rad: 2 + r() * 9, appear: r() * 0.55, spin: 0.9 + r() * 1.1 };
    });
    speedG.innerHTML = '';
    const lines = Array.from({ length: 6 }, () => {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      speedG.appendChild(l);
      return l;
    });

    let g: Geo | null = null;
    let lastKey = '';

    const rel = (el: Element): Box => {
      const sr = stage.getBoundingClientRect(), b = el.getBoundingClientRect();
      return { x: b.left - sr.left, y: b.top - sr.top, w: b.width, h: b.height };
    };
    const slotOf = (b: Box): Box => ({ x: b.x + b.w * LOGO_SURFER.left, y: b.y + b.h * LOGO_SURFER.top, w: b.w * LOGO_SURFER.width, h: b.h * LOGO_SURFER.height });

    function measure(): Geo {
      const W = stage!.clientWidth, H = stage!.clientHeight;
      const uh = Math.min(W / 1920, H / 1171);
      const hx = (W - 1920 * uh) / 2, hy = (H - 1171 * uh) / 2;
      const logo = slotOf({ x: hx + 703 * uh, y: hy + 282 * uh, w: 515 * uh, h: 370 * uh });
      const cornerSlot = slotOf(rel(cornerType!));
      const foot = rel(footSurfer!);
      const L = center(logo), C = center(cornerSlot), F = center(foot);
      const S = { x: 0.52 * W, y: 0.8 * H };
      const Cp = { x: C.x + 0.06 * W, y: C.y + 0.09 * H };
      const seg1 = [L, { x: L.x - 0.08 * W, y: L.y + 0.15 * H }, { x: S.x + 0.12 * W, y: S.y - 0.05 * H }, S];
      const seg2 = [S, { x: S.x - 0.1 * W, y: S.y - 0.04 * H }, { x: Cp.x + 0.32 * W, y: Cp.y + 0.26 * H }, Cp];
      const E = { x: S.x + 0.03 * W, y: H + 80 }, T = { x: Cp.x - 0.1 * W, y: -160 };
      const pts: Pt[] = [E, S];
      for (let i = 1; i <= 60; i++) pts.push(cubic(seg2, i / 60));
      pts.push(T);
      const lens = [0];
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const half = lens[lens.length - 1] / 2;
      let hi = 1; while (lens[hi] < half) hi++;
      const hole = lerpPt(pts[hi - 1], pts[hi], (half - lens[hi - 1]) / (lens[hi] - lens[hi - 1]));
      return {
        W, H, foot, sL: logo.w / foot.w, sC: cornerSlot.w / foot.w, L, C, Cp, S, F, seg1, seg2,
        trail: pts, lens, iS: 1, iCp: pts.length - 2, hole, footTop: H - FOOTER_H,
      };
    }

    function layout() {
      g = measure();
      actor!.style.width = `${g.foot.w}px`;
      actor!.style.height = `${g.foot.h}px`;
      fx!.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
      const d = 'M' + g.trail.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L');
      trail!.setAttribute('d', d);
      trailInk!.setAttribute('d', d);
      halves.forEach((h) => { h.style.transformOrigin = `${g!.hole.x}px ${g!.hole.y}px`; });
      lastKey = ''; lastS = -1; clipKey = '';
    }

    // Flight progress: one eased curve over the swoop down and the sweep up (no stop at the bottom).
    const flightV = (a: number) => easeInOut(seg(a, 0.28, 0.62));
    const SPLIT = 0.45;

    function pathAt(a: number): { p: Pt; s: number } {
      const G = g!;
      if (a < 0.28) {
        const lift = a < 0.12 ? Math.sin(Math.PI * seg(a, 0.025, 0.1)) * 0.5 * G.foot.h * G.sL : 0;
        return { p: { x: G.L.x, y: G.L.y - lift }, s: G.sL * (1 + 0.06 * easeInOut(seg(a, 0.12, 0.2))) };
      }
      if (a < 0.62) {
        const v = flightV(a);
        if (v < SPLIT) { const u = v / SPLIT; return { p: cubic(G.seg1, u), s: G.sL * lerp(1.06, 1.25, u) }; }
        const u = (v - SPLIT) / (1 - SPLIT);
        return { p: cubic(G.seg2, u), s: G.sL * lerp(1.25, 0.7, u) };
      }
      if (a < 0.78) {
        const bob = Math.sin(seg(a, 0.62, 0.78) * Math.PI * 2) * 0.008 * G.H;
        return { p: { x: G.Cp.x, y: G.Cp.y + bob }, s: G.sL * 0.7 };
      }
      const u = easeInOut(seg(a, 0.78, 0.92));
      return { p: lerpPt(G.Cp, G.C, u), s: lerp(G.sL * 0.7, G.sC, u) };
    }

    function poseA(a: number): Pose {
      const { p, s } = pathAt(a);
      const frame = frameAt(a, FRAMES_A);
      // Direction of travel (numerical derivative), used for tilt and bank while flying.
      const q0 = pathAt(Math.max(0, a - 0.002)).p, q1 = pathAt(Math.min(1, a + 0.002)).p;
      const vx = q1.x - q0.x, vy = q1.y - q0.y, vl = Math.hypot(vx, vy);
      const dirX = vl > 1e-4 ? vx / vl : -1, dirY = vl > 1e-4 ? vy / vl : 0;
      const flyRy = MAX_TILT * -dirX, flyRz = 14 * dirY;
      let ry: number, rz: number;
      if (a < 0.12) { ry = 0; rz = 0; }
      else if (a < 0.2) { ry = 4 * easeInOut(seg(a, 0.12, 0.2)); rz = 0; }
      else if (a < 0.28) { const t = easeInOut(seg(a, 0.2, 0.28)); ry = lerp(4, 18, t); rz = lerp(0, -6, t); }
      else if (a < 0.62) { const t = easeInOut(seg(a, 0.28, 0.34)); ry = lerp(18, flyRy, t); rz = lerp(-6, flyRz, t); }
      else {
        const endRy = MAX_TILT, t = easeInOut(seg(a, 0.62, 0.9));
        ry = lerp(endRy, 0, t); rz = lerp(-8, 0, easeInOut(seg(a, 0.62, 0.74)));
      }
      ry = Math.max(-MAX_TILT, Math.min(MAX_TILT, ry));
      const sy = 1 - 0.07 * bump(a, 0, 0.025) + 0.05 * bump(a, 0.025, 0.1) - 0.06 * bump(a, 0.1, 0.135) - 0.05 * bump(a, 0.9, 0.96);
      return { p, s, frame, rz, ry, sy };
    }

    function burstAt(c: Pt, R: number, spin: number, opacity: number) {
      const pts: string[] = [];
      for (let i = 0; i < 32; i++) {
        const ang = (i / 32) * Math.PI * 2 + spin, rr = i % 2 === 0 ? R : R * 0.55;
        pts.push(`${(c.x + Math.cos(ang) * rr).toFixed(1)},${(c.y + Math.sin(ang) * rr).toFixed(1)}`);
      }
      burst!.setAttribute('points', pts.join(' '));
      burst!.style.visibility = 'visible';
      burst!.style.opacity = opacity.toFixed(3);
    }

    let lastS = -1;
    let clipKey = '';
    function renderSeq(sm: number) {
      if (!g) return;
      if (Math.abs(sm - lastS) < 1e-5 && lastKey === String(framesReady)) return;
      lastS = sm; lastKey = String(framesReady);
      const G = g;
      const a = seg(sm, START.a, START.a + PHASE.a);

      const rise = seg(sm, START.rise, START.rise + 0.85);
      stage!.style.setProperty('--rise', (1 - Math.pow(1 - rise, 3)).toFixed(4));

      stage!.style.setProperty('--bigtype', String(1 - seg(a, 0.35, 0.8)));
      const cornerO = seg(a, 0.6, 0.92);
      stage!.style.setProperty('--corner-o', cornerO.toFixed(3));
      corner!.classList.toggle('is-live', cornerO > 0.5);
      stage!.classList.toggle('is-launched', a > 0.001);
      stage!.classList.toggle('is-split', a >= 0.64);

      // Actor: movement on the outer box, pose (tilt, bank, squash) on the inner one
      const pose = poseA(a);
      const show = a > 0.001;
      actor!.classList.toggle('is-on', show);
      if (show) {
        const f = framesReady ? pose.frame : 0;
        imgs.forEach((im, i) => im.classList.toggle('is-on', i === f));
        if (num) num.textContent = `F${String(pose.frame).padStart(2, '0')}`;
        const stand = isStandIn(f);
        const ry = stand ? pose.ry : 0, sy = stand ? pose.sy : 1, sx = stand ? 2 - pose.sy : 1;
        actor!.style.transform = `translate(${(pose.p.x - G.foot.w / 2).toFixed(2)}px, ${(pose.p.y - G.foot.h / 2).toFixed(2)}px) scale(${pose.s.toFixed(5)})`;
        poseEl.style.transform = `perspective(1400px) rotateY(${ry.toFixed(2)}deg) rotateZ(${pose.rz.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
      }

      // Contrail = the tear, drawn behind the board during the sweep up
      const total = G.lens[G.lens.length - 1];
      const v = flightV(a);
      let reveal = 0;
      if (a >= 0.28 && v >= SPLIT) {
        const u = (v - SPLIT) / (1 - SPLIT);
        const idx = G.iS + u * (G.iCp - G.iS), i0 = Math.floor(idx), fr = idx - i0;
        reveal = lerp(G.lens[i0], G.lens[Math.min(i0 + 1, G.lens.length - 1)], fr);
        if (a >= 0.62) reveal = lerp(G.lens[G.iCp], total, easeInOut(seg(a, 0.62, 0.645)));
      }
      const w = lerp(Math.max(10, 0.012 * G.W), 0.06 * G.W, easeInOut(seg(a, 0.62, 0.66)));
      const trailO = 1 - seg(a, 0.72, 0.8);
      [trail!, trailInk!].forEach((pth) => {
        pth.style.strokeDasharray = `${total} ${total}`;
        pth.style.strokeDashoffset = `${total - reveal}`;
      });
      trailG!.style.opacity = reveal > 0 ? trailO.toFixed(3) : '0';
      trail!.style.strokeWidth = `${w}`;
      trailInk!.style.strokeWidth = `${w + 6}`;

      // Yellow halves and black-hole collapse
      const split = a >= 0.64 && a < 0.82;
      if (split) {
        const key = w.toFixed(1);
        if (key !== clipKey) {
          clipKey = key;
          const off = (sign: number) => G.trail.map((pt, i) => {
            const q = G.trail[Math.min(i + 1, G.trail.length - 1)], o = G.trail[Math.max(i - 1, 0)];
            const dx = q.x - o.x, dy = q.y - o.y, len = Math.hypot(dx, dy) || 1;
            return `${(pt.x + sign * (dy / len) * (w / 2)).toFixed(1)}px ${(pt.y - sign * (dx / len) * (w / 2)).toFixed(1)}px`;
          });
          const e0 = G.trail[0], t0 = G.trail[G.trail.length - 1];
          halves[0].style.clipPath = `polygon(${off(1).join(',')}, ${-3 * G.W}px ${t0.y}px, ${-3 * G.W}px ${e0.y}px)`;
          halves[1].style.clipPath = `polygon(${off(-1).join(',')}, ${4 * G.W}px ${t0.y}px, ${4 * G.W}px ${e0.y}px)`;
        }
        const k = easeInOut(seg(a, 0.66, 0.82));
        halves.forEach((h, i) => {
          const sign = i === 0 ? -1 : 1;
          h.style.transform = `rotate(${(sign * 35 * k).toFixed(3)}deg) scale(${(1 - 0.96 * k).toFixed(4)})`;
          h.style.opacity = String(1 - seg(k, 0.75, 1));
          h.style.filter = k > 0.001 ? 'url(#bh-warp)' : 'none';
          h.style.visibility = 'visible';
        });
        warp!.setAttribute('scale', String(Math.round((90 * k) / 6) * 6));
      } else {
        halves.forEach((h) => { h.style.visibility = 'hidden'; });
      }

      // Krackle
      const kk = easeInOut(seg(a, 0.66, 0.82)), krackleOn = a >= 0.63 && a < 0.82;
      dots.forEach((d) => {
        const visible = krackleOn && (a < 0.66 ? d.appear < 0.2 : kk >= d.appear * 0.8 && kk < 0.97);
        if (!visible) { d.el.setAttribute('r', '0'); return; }
        const Ld = d.along * total;
        let i = 1; while (i < G.lens.length - 1 && G.lens[i] < Ld) i++;
        const p0 = G.trail[i - 1], p1 = G.trail[i], dx = p1.x - p0.x, dy = p1.y - p0.y, ln = Math.hypot(dx, dy) || 1;
        const on = lerpPt(p0, p1, (Ld - G.lens[i - 1]) / ((G.lens[i] - G.lens[i - 1]) || 1));
        const dist = w / 2 + 4 + d.off * 0.22 * G.W;
        const base0 = { x: on.x + d.side * (dy / ln) * dist, y: on.y - d.side * (dx / ln) * dist };
        const pulled = rotateAround(lerpPt(base0, G.hole, kk * kk), G.hole, d.side * kk * d.spin);
        const rad = d.rad * (G.W / 1440) * (1 - 0.7 * kk) * (a < 0.66 ? 0.6 : 1);
        d.el.setAttribute('cx', pulled.x.toFixed(1));
        d.el.setAttribute('cy', pulled.y.toFixed(1));
        d.el.setAttribute('r', rad.toFixed(1));
      });

      // Speed lines while flying
      if (show && a > 0.29 && a < 0.61) {
        const q0 = pathAt(Math.max(0, a - 0.004)).p;
        let vx = pose.p.x - q0.x, vy = pose.p.y - q0.y; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
        const size = G.foot.w * pose.s, fade = Math.min(seg(a, 0.29, 0.33), 1 - seg(a, 0.57, 0.61));
        lines.forEach((l, i) => {
          const o = (i - 2.5) * 0.16 * size, back = 0.45 * size + (i % 2) * 0.12 * size, len = 0.5 * size + ((i * 37) % 5) * 0.06 * size;
          const sx0 = pose.p.x - vx * back - vy * o, sy0 = pose.p.y - vy * back + vx * o;
          l.setAttribute('x1', sx0.toFixed(1)); l.setAttribute('y1', sy0.toFixed(1));
          l.setAttribute('x2', (sx0 - vx * len).toFixed(1)); l.setAttribute('y2', (sy0 - vy * len).toFixed(1));
          l.style.visibility = 'visible'; l.style.opacity = fade.toFixed(3);
        });
      } else lines.forEach((l) => { l.style.visibility = 'hidden'; });

      // Landing burst after the hop
      if (a >= 0.1 && a < 0.145) {
        const t = seg(a, 0.1, 0.145);
        burstAt({ x: pose.p.x, y: pose.p.y + 0.3 * G.foot.h * pose.s }, 0.42 * G.foot.w * pose.s * (0.7 + 0.5 * t), t * 0.6, 1 - t);
      } else burst!.style.visibility = 'hidden';
    }

    function renderRaw(s: number) {
      hero!.style.setProperty('--p', seg(s, 0, PHASE.hero).toFixed(4));
      hero!.classList.toggle('is-revealed', seg(s, 0, PHASE.hero) >= 0.7);
      const white = seg(s, START.white, START.white + PHASE.white);
      finale!.style.setProperty('--p', white.toFixed(4));
      fnav?.classList.toggle('is-cued', white >= 0.2);
      steps!.style.setProperty('--p', seg(s, START.steps, START.steps + PHASE.steps).toFixed(4));
    }

    const proxy = { s: 0 };
    const pin = ScrollTrigger.create({
      trigger: stage,
      pin: true,
      start: 'top top',
      end: () => `+=${TOTAL * window.innerHeight}`,
      invalidateOnRefresh: true,
      onUpdate: (st) => renderRaw(st.progress * TOTAL),
      onRefresh: (st) => { layout(); renderRaw(st.progress * TOTAL); renderSeq(proxy.s); },
    });
    gsap.to(proxy, {
      s: TOTAL,
      ease: 'none',
      scrollTrigger: { start: () => pin.start, end: () => pin.end, scrub: 0.6, invalidateOnRefresh: true },
      onUpdate: () => renderSeq(proxy.s),
    });
    layout();
    renderRaw(pin.progress * TOTAL);
    proxy.s = pin.progress * TOTAL;
    renderSeq(proxy.s);

    return () => {
      stage.classList.remove('is-pinned', 'is-launched', 'is-split');
      ['--bigtype', '--corner-o', '--rise'].forEach((v) => stage.style.removeProperty(v));
      hero.style.removeProperty('--p');
      hero.classList.remove('is-revealed');
      finale.style.removeProperty('--p');
      fnav?.classList.remove('is-cued');
      steps.style.removeProperty('--p');
      halvesEl.innerHTML = '';
      krackleG.innerHTML = '';
      speedG.innerHTML = '';
      actor.classList.remove('is-on');
      actor.style.removeProperty('transform');
      poseEl.style.removeProperty('transform');
    };
  });
}

export function initLanding() {
  document.addEventListener('astro:page-load', setup);
  document.addEventListener('astro:before-swap', () => { mm?.revert(); mm = null; });
}
