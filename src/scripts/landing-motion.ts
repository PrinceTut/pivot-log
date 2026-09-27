import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { POSES, ORIGIN, LOGO_SURFER } from './landing-frames';

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
const FOOTER_H = 96;
const PIN_QUERY = '(min-width: 900px) and (prefers-reduced-motion: no-preference)';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (p: Pt, q: Pt, t: number): Pt => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
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
// Point at arc length d along a sampled polyline (lens = cumulative lengths).
function atLength(pts: Pt[], lens: number[], d: number): Pt {
  if (d <= 0) return pts[0];
  const last = lens.length - 1;
  if (d >= lens[last]) return pts[last];
  let lo = 0, hi = last;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lens[mid] < d) lo = mid; else hi = mid; }
  return lerpPt(pts[lo], pts[hi], (d - lens[lo]) / ((lens[hi] - lens[lo]) || 1));
}
function cumulative(pts: Pt[]): number[] {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return lens;
}

// Sequence A pose changes, in Sequence A progress (0..1): [start, end, from pose, to pose].
// Pose indices follow POSES: 0 rest (logo), 1 crouch, 2 rise, 3 stand, 4 launch, 5 seated.
const CHANGES: [number, number, number, number][] = [
  [0.01, 0.07, 0, 1],
  [0.08, 0.13, 1, 2],
  [0.14, 0.19, 2, 3],
  [0.22, 0.27, 3, 4],
  [0.78, 0.86, 4, 5],
  [0.88, 0.93, 5, 0],
];
// The board tilt eases over a slightly wider window than the image change, so the rotation leads and trails the blend.
const ANGLE_PAD = 0.012;
// Share of each change spent fading the new pose in on top; the rest fades the old pose out underneath.
const BLEND_IN = 0.4;
const FLIGHT = { a: 0.28, b: 0.62 };
// Lean limits: a light nose-down lean on the drop, a stronger nose-up lean on the climb.
const BANK = { dive: 12, climb: 24, diveGain: 0.3, climbGain: 0.5, span: 0.18 };

interface Geo {
  W: number; H: number; foot: Box; sL: number; sC: number;
  L: Pt; C: Pt; Cp: Pt;
  path: Pt[]; pathLens: number[]; len1: number;
  trail: Pt[]; lens: number[]; iS: number; hole: Pt;
}

let mm: gsap.MatchMedia | null = null;
let framesReady = false;
let onFramesReady: (() => void) | null = null;

async function preloadFrames(base: string) {
  await Promise.all(POSES.map((pose) => { const img = new Image(); img.src = base + pose.file; return img.decode().catch(() => undefined); }));
  framesReady = true;
  onFramesReady?.();
}

// Opacity of every pose image at Sequence A progress a. Two-phase blend: the incoming pose
// fades in on top of the fully opaque outgoing pose, then the outgoing pose fades out underneath,
// so the figure is never see-through at the midpoint.
function poseWeights(a: number): { w: number[]; top: number } {
  const w = POSES.map(() => 0);
  let settled = 0;
  for (const [a0, a1, from, to] of CHANGES) {
    if (a < a0) break;
    if (a >= a1) { settled = to; continue; }
    const t = easeInOut(seg(a, a0, a1));
    w[from] = Math.min(1, (1 - t) / (1 - BLEND_IN));
    w[to] = Math.min(1, t / BLEND_IN);
    return { w, top: to };
  }
  w[settled] = 1;
  return { w, top: settled };
}
function boardAngle(a: number): number {
  let ang = POSES[0].angle;
  for (const [a0, a1, from, to] of CHANGES) ang += (POSES[to].angle - POSES[from].angle) * easeInOut(seg(a, Math.max(0.002, a0 - ANGLE_PAD), a1 + ANGLE_PAD));
  return ang;
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
  const imgs = POSES.map((pose) => actor.querySelector<HTMLImageElement>(`img[data-pose="${pose.name}"]`));
  const poseFound = actor.querySelector<HTMLElement>('.actor__pose');
  if (!poseFound || imgs.some((im) => !im)) return;
  const poseEl: HTMLElement = poseFound;
  const poseImgs = imgs as HTMLImageElement[];
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
      for (const at of Array.from(hero.parentElement!.attributes)) if (at.name.startsWith('data-astro-cid')) half.setAttribute(at.name, at.value);
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
    let lastS = -1;
    let lastReady = false;
    let clipKey = '';
    const shownOpacity = POSES.map(() => '');
    let shownTop = -1;

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
      const L = center(logo), C = center(cornerSlot);
      const Cp = { x: C.x + 0.07 * W, y: C.y + 0.16 * H };
      // Drop from the logo to a low point just under the bottom edge, then sweep up and left to the corner.
      // Both curves share a horizontal tangent at S, so the turn at the bottom has no kink.
      const S = { x: L.x - 0.02 * W, y: 1.04 * H };
      const seg1 = [L, { x: L.x, y: L.y + 0.28 * H }, { x: S.x + 0.16 * W, y: S.y }, S];
      const seg2 = [S, { x: S.x - 0.22 * W, y: S.y }, { x: Cp.x + 0.14 * W, y: Cp.y + 0.3 * H }, Cp];
      const N = 80;
      const s1: Pt[] = [], s2: Pt[] = [];
      for (let i = 0; i <= N; i++) s1.push(cubic(seg1, i / N));
      for (let i = 0; i <= N; i++) s2.push(cubic(seg2, i / N));
      const path = s1.concat(s2.slice(1));
      const pathLens = cumulative(path);
      const len1 = pathLens[N];
      // The tear follows the sweep up: enters off-screen below S and leaves off-screen above the corner.
      const E = { x: S.x + 0.2 * W, y: S.y + 0.02 * H }, T = { x: Cp.x - 0.02 * W, y: -160 };
      const trailPts = [E, ...s2, T];
      const lens = cumulative(trailPts);
      const hole = atLength(s2, cumulative(s2), (pathLens[pathLens.length - 1] - len1) / 2);
      return { W, H, foot, sL: logo.w / foot.w, sC: cornerSlot.w / foot.w, L, C, Cp, path, pathLens, len1, trail: trailPts, lens, iS: 1, hole };
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
      lastS = -1; clipKey = '';
    }

    // Distance travelled along the flight path: eased once over the whole flight, constant shape speed.
    const flightDist = (a: number) => easeInOut(seg(a, FLIGHT.a, FLIGHT.b)) * g!.pathLens[g!.pathLens.length - 1];

    function pathAt(a: number): { p: Pt; s: number } {
      const G = g!;
      if (a < FLIGHT.a) return { p: G.L, s: G.sL * (1 + 0.06 * easeInOut(seg(a, 0.12, 0.22))) };
      if (a < FLIGHT.b) {
        const d = flightDist(a), total = G.pathLens[G.pathLens.length - 1];
        const p = atLength(G.path, G.pathLens, d);
        const s = d < G.len1 ? lerp(1.06, 1.25, d / G.len1) : lerp(1.25, 0.7, (d - G.len1) / (total - G.len1));
        return { p, s: G.sL * s };
      }
      if (a < 0.78) {
        const t = seg(a, FLIGHT.b, 0.78);
        return { p: { x: G.Cp.x, y: G.Cp.y - 0.012 * G.H * (0.5 - 0.5 * Math.cos(2 * Math.PI * t)) }, s: G.sL * 0.7 };
      }
      const u = easeInOut(seg(a, 0.78, 0.92));
      return { p: lerpPt(G.Cp, G.C, u), s: lerp(G.sL * 0.7, G.sC, u) };
    }

    // Bank into the direction of travel: nose up when climbing, nose down when diving. Rotation only, never a turn.
    // The heading is the path's direction averaged over a stretch of the path either side of him, so the lean
    // rolls smoothly through the turn at the bottom and stays steady while he slows into the hover.
    function bankAt(a: number): number {
      const weight = easeInOut(seg(a, FLIGHT.a, 0.34)) * (1 - easeInOut(seg(a, 0.6, 0.68)));
      if (weight <= 0) return 0;
      const G = g!, total = G.pathLens[G.pathLens.length - 1], span = BANK.span * total;
      const d = a < FLIGHT.b ? flightDist(a) : total;
      const q0 = atLength(G.path, G.pathLens, Math.max(0, Math.min(d, total - 2 * span) - span)), q1 = atLength(G.path, G.pathLens, Math.min(total, Math.max(d, 2 * span) + span));
      const heading = (Math.atan2(-(q1.y - q0.y), Math.max(-(q1.x - q0.x), 0)) * 180) / Math.PI;
      const lean = heading < 0 ? Math.max(-BANK.dive, BANK.diveGain * heading) : Math.min(BANK.climb, BANK.climbGain * heading);
      return lean * weight;
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

    function renderSeq(sm: number) {
      if (!g) return;
      if (Math.abs(sm - lastS) < 1e-5 && lastReady === framesReady) return;
      lastS = sm; lastReady = framesReady;
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

      // Actor: position and size on the outer box; pose images and board tilt on the inner layer
      const { p, s } = pathAt(a);
      const show = a > 0.001;
      actor!.classList.toggle('is-on', show);
      if (show) {
        const { w, top } = framesReady ? poseWeights(a) : { w: POSES.map((_, i) => (i === 0 ? 1 : 0)), top: 0 };
        poseImgs.forEach((im, i) => {
          const o = w[i] > 0.001 ? w[i].toFixed(3) : '0';
          if (o !== shownOpacity[i]) { im.style.opacity = o; shownOpacity[i] = o; }
        });
        if (top !== shownTop) { poseImgs.forEach((im, i) => { im.style.zIndex = i === top ? '2' : '1'; }); shownTop = top; }
        if (num) num.textContent = POSES[top].name;
        const rot = -boardAngle(a) + bankAt(a);
        actor!.style.transform = `translate(${(p.x - G.foot.w / 2).toFixed(2)}px, ${(p.y - G.foot.h / 2).toFixed(2)}px) scale(${s.toFixed(5)})`;
        poseEl.style.transform = `rotate(${rot.toFixed(3)}deg)`;
      }

      // Contrail = the tear, drawn behind the board during the sweep up
      const total = G.lens[G.lens.length - 1];
      let reveal = 0;
      if (a >= FLIGHT.b) reveal = lerp(G.lens[G.lens.length - 2], total, easeInOut(seg(a, FLIGHT.b, 0.645)));
      else if (a >= FLIGHT.a) {
        const past = flightDist(a) - G.len1;
        if (past > 0) reveal = G.lens[G.iS] + past;
      }
      const wTear = lerp(Math.max(10, 0.012 * G.W), 0.06 * G.W, easeInOut(seg(a, 0.62, 0.66)));
      const trailO = 1 - seg(a, 0.72, 0.8);
      [trail!, trailInk!].forEach((pth) => {
        pth.style.strokeDasharray = `${total} ${total}`;
        pth.style.strokeDashoffset = `${total - reveal}`;
      });
      trailG!.style.opacity = reveal > 0 ? trailO.toFixed(3) : '0';
      trail!.style.strokeWidth = `${wTear}`;
      trailInk!.style.strokeWidth = `${wTear + 6}`;

      // Yellow halves and black-hole collapse
      const split = a >= 0.64 && a < 0.82;
      if (split) {
        const key = wTear.toFixed(1);
        if (key !== clipKey) {
          clipKey = key;
          const off = (sign: number) => G.trail.map((pt, i) => {
            const q = G.trail[Math.min(i + 1, G.trail.length - 1)], o = G.trail[Math.max(i - 1, 0)];
            const dx = q.x - o.x, dy = q.y - o.y, len = Math.hypot(dx, dy) || 1;
            return `${(pt.x + sign * (dy / len) * (wTear / 2)).toFixed(1)}px ${(pt.y - sign * (dx / len) * (wTear / 2)).toFixed(1)}px`;
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
        const dist = wTear / 2 + 4 + d.off * 0.22 * G.W;
        const base0 = { x: on.x + d.side * (dy / ln) * dist, y: on.y - d.side * (dx / ln) * dist };
        const pulled = rotateAround(lerpPt(base0, G.hole, kk * kk), G.hole, d.side * kk * d.spin);
        const rad = d.rad * (G.W / 1440) * (1 - 0.7 * kk) * (a < 0.66 ? 0.6 : 1);
        d.el.setAttribute('cx', pulled.x.toFixed(1));
        d.el.setAttribute('cy', pulled.y.toFixed(1));
        d.el.setAttribute('r', rad.toFixed(1));
      });

      // Speed lines while flying, trailing behind the direction of travel
      if (show && a > 0.3 && a < 0.61) {
        const q0 = pathAt(Math.max(0, a - 0.004)).p;
        let vx = p.x - q0.x, vy = p.y - q0.y; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
        const size = G.foot.w * s, fade = Math.min(seg(a, 0.3, 0.35), 1 - seg(a, 0.56, 0.61));
        lines.forEach((l, i) => {
          const o = (i - 2.5) * 0.16 * size, back = 0.45 * size + (i % 2) * 0.12 * size, len = 0.5 * size + ((i * 37) % 5) * 0.06 * size;
          const sx0 = p.x - vx * back - vy * o, sy0 = p.y - vy * back + vx * o;
          l.setAttribute('x1', sx0.toFixed(1)); l.setAttribute('y1', sy0.toFixed(1));
          l.setAttribute('x2', (sx0 - vx * len).toFixed(1)); l.setAttribute('y2', (sy0 - vy * len).toFixed(1));
          l.style.visibility = 'visible'; l.style.opacity = fade.toFixed(3);
        });
      } else lines.forEach((l) => { l.style.visibility = 'hidden'; });

      // Push-off burst at the tail of the board as he launches
      if (a >= 0.255 && a < 0.33) {
        const t = seg(a, 0.255, 0.33);
        const L = G.L, bx = L.x + (ORIGIN.x - 0.5) * G.foot.w * G.sL * 1.06, by = L.y + (ORIGIN.y - 0.5) * G.foot.h * G.sL * 1.06;
        const R = 0.34 * G.foot.w * G.sL * (0.55 + 0.6 * easeInOut(t));
        burstAt({ x: bx + 0.22 * G.foot.w * G.sL, y: by + 0.04 * G.foot.h * G.sL }, R, t * 0.5, Math.min(1, 4 * t) * (1 - easeInOut(seg(t, 0.35, 1))));
      } else burst!.style.visibility = 'hidden';
    }

    function renderRaw(sv: number) {
      hero!.style.setProperty('--p', seg(sv, 0, PHASE.hero).toFixed(4));
      hero!.classList.toggle('is-revealed', seg(sv, 0, PHASE.hero) >= 0.7);
      const white = seg(sv, START.white, START.white + PHASE.white);
      finale!.style.setProperty('--p', white.toFixed(4));
      fnav?.classList.toggle('is-cued', white >= 0.2);
      steps!.style.setProperty('--p', seg(sv, START.steps, START.steps + PHASE.steps).toFixed(4));
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
    onFramesReady = () => { lastS = -1; renderSeq(proxy.s); };
    void preloadFrames(base);

    return () => {
      onFramesReady = null;
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
      poseImgs.forEach((im) => { im.style.removeProperty('opacity'); im.style.removeProperty('z-index'); });
    };
  });
}

export function initLanding() {
  document.addEventListener('astro:page-load', setup);
  document.addEventListener('astro:before-swap', () => { mm?.revert(); mm = null; });
}
