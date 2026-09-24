import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FRAMES, LOGO_SURFER } from './landing-frames';

gsap.registerPlugin(ScrollTrigger);

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

const PHASE = { hero: 1.5, a: 5, white: 1, prism: 2, b: 3 };
const START = {
  a: PHASE.hero,
  white: PHASE.hero + PHASE.a,
  prism: PHASE.hero + PHASE.a + PHASE.white,
  b: PHASE.hero + PHASE.a + PHASE.white + PHASE.prism,
};
const TOTAL = START.b + PHASE.b;
const STEPS_PER_SCREEN = 12;
const FOOTER_H = 96;
const PIN_QUERY = '(min-width: 900px) and (prefers-reduced-motion: no-preference)';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (p: Pt, q: Pt, t: number): Pt => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
const smooth = (t: number) => t * t * (3 - 2 * t);
const quant = (v: number, n: number) => Math.min(1, Math.floor(v * n + 1e-6) / n);
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
function faceAt(p: number) {
  if (p < 0.2) return 0;
  if (p < 0.4) return smooth((p - 0.2) / 0.2);
  if (p < 0.6) return 1;
  if (p < 0.8) return 1 + smooth((p - 0.6) / 0.2);
  return 2;
}

// Frame schedules: [start, frame]; -1 = hidden.
const FRAMES_A: [number, number][] = [[0, 0], [0.02, 1], [0.04, 2], [0.06, 3], [0.09, 4], [0.12, 5], [0.16, 6], [0.21, 7], [0.27, 8], [0.32, 9], [0.40, 10], [0.80, 11], [0.88, 0]];
const FRAMES_B: [number, number][] = [[0, 0], [0.02, 1], [0.05, 2], [0.08, 3], [0.10, 4], [0.16, 5], [0.22, 6], [0.28, 7], [0.34, 8], [0.40, 9], [0.46, 10], [0.52, -1], [0.62, 10], [0.80, 11], [0.90, 0]];
const frameAt = (v: number, table: [number, number][]) => {
  let f = table[0][1];
  for (const [start, frame] of table) if (v >= start) f = frame;
  return f;
};
// Stand-in poses, used only while a frame still reuses the F00 artwork.
const STAND_IN_FLIP: Record<number, number> = { 6: 0.55, 7: 0.12, 8: -0.55, 9: -1, 10: -1, 11: -1 };
const STAND_IN_SQUASH: Record<number, number> = { 1: 0.97, 2: 0.9, 3: 1.06, 4: 0.94, 11: 0.92 };
const STAND_IN_LEAN: Record<number, number> = { 9: -14, 10: -24, 11: -6 };
const isStandIn = (f: number) => f > 0 && FRAMES[f] === FRAMES[0];

interface Geo {
  W: number; H: number; foot: Box; sL: number; sC: number;
  L: Pt; C: Pt; Cp: Pt; S: Pt; F: Pt; seg1: Pt[]; seg2: Pt[];
  trail: Pt[]; lens: number[]; iS: number; iCp: number; hole: Pt; footTop: number;
}
interface Pose { p: Pt; s: number; frame: number; lean: number; }

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
  const prism = document.getElementById('prism');
  const halvesEl = document.getElementById('halves');
  const actor = document.getElementById('actor');
  const corner = document.getElementById('corner');
  const cornerType = document.getElementById('corner-type');
  const footSurfer = document.getElementById('foot-surfer');
  const trail = document.getElementById('fx-trail') as SVGPathElement | null;
  const trailInk = document.getElementById('fx-trail-ink') as SVGPathElement | null;
  const krackleG = document.getElementById('fx-krackle');
  const speedG = document.getElementById('fx-speed');
  const burst = document.getElementById('fx-burst') as SVGPolygonElement | null;
  const fx = document.getElementById('fx') as SVGSVGElement | null;
  const warp = document.getElementById('bh-warp-map');
  if (!stage || !hero || !finale || !prism || !halvesEl || !actor || !corner || !cornerType || !footSurfer || !trail || !trailInk || !krackleG || !speedG || !burst || !fx || !warp) return;

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
      const seg1 = [L, { x: L.x + 0.3 * W, y: L.y + 0.02 * H }, { x: S.x + 0.28 * W, y: S.y + 0.02 * H }, S];
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
      lastKey = '';
    }

    function poseA(a: number): Pose {
      const G = g!;
      const frame = frameAt(a, FRAMES_A);
      const hop = a >= 0.02 && a < 0.11 ? Math.sin(Math.PI * seg(a, 0.02, 0.11)) : 0;
      if (a < 0.32) {
        const s = G.sL * (1 + 0.08 * smooth(seg(a, 0.11, 0.16)));
        return { p: { x: G.L.x, y: G.L.y - hop * 0.45 * G.foot.h * G.sL }, s, frame, lean: 0 };
      }
      if (a < 0.46) { const u = seg(a, 0.32, 0.46); return { p: cubic(G.seg1, u), s: G.sL * lerp(1.08, 1.3, u), frame, lean: 0 }; }
      if (a < 0.62) { const u = seg(a, 0.46, 0.62); return { p: cubic(G.seg2, u), s: G.sL * lerp(1.3, 0.75, u), frame, lean: 0 }; }
      if (a < 0.8) {
        const bob = Math.sin(seg(a, 0.62, 0.8) * Math.PI * 2) * 0.01 * G.H;
        return { p: { x: G.Cp.x, y: G.Cp.y + bob }, s: G.sL * 0.75, frame, lean: 0 };
      }
      const u = smooth(seg(a, 0.8, 0.92));
      return { p: lerpPt(G.Cp, G.C, u), s: lerp(G.sL * 0.75, G.sC, u), frame, lean: 0 };
    }

    function poseB(b: number): Pose {
      const G = g!;
      const frame = frameAt(b, FRAMES_B);
      if (b < 0.1) {
        const hop = b >= 0.02 ? Math.sin(Math.PI * seg(b, 0.02, 0.1)) : 0;
        return { p: { x: G.C.x + seg(b, 0.02, 0.1) * 0.02 * G.W, y: G.C.y - hop * 0.9 * G.foot.h * G.sC }, s: G.sC, frame, lean: 0 };
      }
      const P0 = { x: G.C.x + 0.02 * G.W, y: G.C.y };
      const A0 = { x: G.C.x + 0.07 * G.W, y: G.C.y + 0.1 * G.H };
      if (b < 0.4) { const u = seg(b, 0.1, 0.4); return { p: rotateAround(P0, A0, u * 1.3 * Math.PI), s: lerp(G.sC, G.sC * 2.6, u), frame, lean: 0 }; }
      if (b < 0.52) {
        const Pa = rotateAround(P0, A0, 1.3 * Math.PI), u = seg(b, 0.4, 0.52);
        return { p: lerpPt(Pa, { x: -0.18 * G.W, y: -0.22 * G.H }, u * u), s: lerp(G.sC * 2.6, G.sC * 4, u), frame, lean: 0 };
      }
      if (b < 0.62) return { p: G.C, s: G.sC, frame: -1, lean: 0 };
      if (b < 0.8) { const u = seg(b, 0.62, 0.8); return { p: lerpPt({ x: G.F.x - 0.04 * G.W, y: -0.75 * G.H }, G.F, u * u), s: 1, frame, lean: 0 }; }
      return { p: G.F, s: 1, frame, lean: 0 };
    }

    function burstAt(c: Pt, R: number, step: number) {
      const pts: string[] = [];
      for (let i = 0; i < 32; i++) {
        const ang = (i / 32) * Math.PI * 2 + step * 0.12, rr = i % 2 === 0 ? R : R * 0.55;
        pts.push(`${(c.x + Math.cos(ang) * rr).toFixed(1)},${(c.y + Math.sin(ang) * rr).toFixed(1)}`);
      }
      burst!.setAttribute('points', pts.join(' '));
      burst!.style.visibility = 'visible';
    }

    function renderSeq(sm: number) {
      if (!g) return;
      const G = g;
      const nA = PHASE.a * STEPS_PER_SCREEN, nB = PHASE.b * STEPS_PER_SCREEN;
      const a = quant(seg(sm, START.a, START.a + PHASE.a), nA);
      const b = quant(seg(sm, START.b, START.b + PHASE.b), nB);
      const key = `${a}|${b}|${framesReady}`;
      if (key === lastKey) return;
      lastKey = key;
      const stepA = Math.round(a * nA), stepB = Math.round(b * nB);

      stage!.style.setProperty('--bigtype', String(1 - seg(a, 0.4, 0.85)));
      const cornerO = seg(a, 0.6, 0.95) * (1 - seg(b, 0.8, 0.95));
      stage!.style.setProperty('--corner-o', cornerO.toFixed(3));
      corner!.classList.toggle('is-live', cornerO > 0.5);
      stage!.classList.toggle('is-launched', a > 0);
      stage!.classList.toggle('is-split', a >= 0.64);
      const landed = b >= 0.999;
      stage!.classList.toggle('is-landed', landed);

      // Actor
      const pose = b > 0 ? poseB(b) : poseA(a);
      const show = a > 0 && pose.frame >= 0 && !landed;
      actor!.classList.toggle('is-on', show);
      if (show) {
        const f = framesReady ? pose.frame : 0;
        imgs.forEach((im, i) => im.classList.toggle('is-on', i === f));
        if (num) num.textContent = `F${String(pose.frame).padStart(2, '0')}`;
        const stand = isStandIn(f);
        const flip = stand && !(b >= 0.62) ? (STAND_IN_FLIP[f] ?? 1) : 1;
        const squash = stand ? (STAND_IN_SQUASH[f] ?? 1) : 1;
        const lean = stand ? (STAND_IN_LEAN[f] ?? 0) : 0;
        actor!.style.transform = `translate(${(pose.p.x - G.foot.w / 2).toFixed(1)}px, ${(pose.p.y - G.foot.h / 2).toFixed(1)}px) scale(${pose.s.toFixed(4)})`;
        poseEl.style.transform = `rotate(${lean}deg) scale(${flip}, ${squash})`;
      }

      // Contrail = the tear
      const total = G.lens[G.lens.length - 1];
      let reveal = 0;
      if (a >= 0.46) {
        const u = seg(a, 0.46, 0.62);
        const idx = G.iS + u * (G.iCp - G.iS), i0 = Math.floor(idx), fr = idx - i0;
        reveal = lerp(G.lens[i0], G.lens[Math.min(i0 + 1, G.lens.length - 1)], fr);
        if (a >= 0.62) reveal = lerp(G.lens[G.iCp], total, seg(a, 0.62, 0.64));
      }
      const w = lerp(Math.max(10, 0.012 * G.W), 0.06 * G.W, seg(a, 0.62, 0.66));
      const trailO = 1 - seg(a, 0.72, 0.78);
      [trail!, trailInk!].forEach((p) => {
        p.style.strokeDasharray = `${total} ${total}`;
        p.style.strokeDashoffset = `${total - reveal}`;
        p.style.opacity = reveal > 0 ? String(trailO) : '0';
      });
      trail!.style.strokeWidth = `${w}`;
      trailInk!.style.strokeWidth = `${w + 6}`;

      // Yellow halves and black-hole collapse
      const split = a >= 0.64 && a < 0.8;
      if (split) {
        const off = (sign: number) => {
          const out: string[] = [];
          for (let i = 0; i < G.trail.length; i++) {
            const p = G.trail[i], q = G.trail[Math.min(i + 1, G.trail.length - 1)], o = G.trail[Math.max(i - 1, 0)];
            const dx = q.x - o.x, dy = q.y - o.y, len = Math.hypot(dx, dy) || 1;
            out.push(`${(p.x + sign * (dy / len) * (w / 2)).toFixed(1)}px ${(p.y - sign * (dx / len) * (w / 2)).toFixed(1)}px`);
          }
          return out;
        };
        const left = off(1), right = off(-1);
        const e0 = G.trail[0], t0 = G.trail[G.trail.length - 1];
        halves[0].style.clipPath = `polygon(${left.join(',')}, ${-3 * G.W}px ${t0.y}px, ${-3 * G.W}px ${e0.y}px)`;
        halves[1].style.clipPath = `polygon(${right.join(',')}, ${4 * G.W}px ${t0.y}px, ${4 * G.W}px ${e0.y}px)`;
        const k = seg(a, 0.66, 0.8);
        halves.forEach((h, i) => {
          const sign = i === 0 ? -1 : 1;
          h.style.transform = `rotate(${sign * 35 * k}deg) scale(${1 - 0.96 * k})`;
          h.style.opacity = String(1 - seg(k, 0.75, 1));
          h.style.filter = k > 0 ? 'url(#bh-warp)' : 'none';
          h.style.visibility = 'visible';
        });
        warp!.setAttribute('scale', String(Math.round(90 * k)));
      } else {
        halves.forEach((h) => { h.style.visibility = 'hidden'; });
      }

      // Krackle
      const kk = seg(a, 0.66, 0.8), krackleOn = a >= 0.63 && a < 0.8;
      dots.forEach((d) => {
        const visible = krackleOn && (a < 0.66 ? d.appear < 0.2 : kk >= d.appear * 0.8 && kk < 0.97);
        if (!visible) { d.el.setAttribute('r', '0'); return; }
        const L = d.along * total;
        let i = 1; while (i < G.lens.length - 1 && G.lens[i] < L) i++;
        const p0 = G.trail[i - 1], p1 = G.trail[i], dx = p1.x - p0.x, dy = p1.y - p0.y, ln = Math.hypot(dx, dy) || 1;
        const on = lerpPt(p0, p1, (L - G.lens[i - 1]) / ((G.lens[i] - G.lens[i - 1]) || 1));
        const dist = w / 2 + 4 + d.off * 0.22 * G.W;
        const base0 = { x: on.x + d.side * (dy / ln) * dist, y: on.y - d.side * (dx / ln) * dist };
        const pulled = rotateAround(lerpPt(base0, G.hole, kk * kk), G.hole, d.side * kk * d.spin);
        const rad = d.rad * (G.W / 1440) * (1 - 0.7 * kk) * (a < 0.66 ? 0.6 : 1);
        d.el.setAttribute('cx', pulled.x.toFixed(1));
        d.el.setAttribute('cy', pulled.y.toFixed(1));
        d.el.setAttribute('r', rad.toFixed(1));
      });

      // Speed lines (flight only)
      const flyingA = b === 0 && a >= 0.32 && a < 0.62;
      const flyingB = b > 0 && ((b >= 0.4 && b < 0.52) || (b >= 0.62 && b < 0.8));
      if (show && (flyingA || flyingB)) {
        const prev = b > 0 ? poseB(Math.max(0, b - 1 / nB)) : poseA(Math.max(0, a - 1 / nA));
        let vx = pose.p.x - prev.p.x, vy = pose.p.y - prev.p.y; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
        const size = G.foot.w * pose.s, jitter = (stepA + stepB) % 3;
        lines.forEach((l, i) => {
          const o = (i - 2.5) * 0.16 * size, back = 0.45 * size + (i % 2) * 0.12 * size + jitter * 4, len = 0.5 * size + ((i * 37) % 5) * 0.06 * size;
          const sx = pose.p.x - vx * back + -vy * o, sy = pose.p.y - vy * back + vx * o;
          l.setAttribute('x1', sx.toFixed(1)); l.setAttribute('y1', sy.toFixed(1));
          l.setAttribute('x2', (sx - vx * len).toFixed(1)); l.setAttribute('y2', (sy - vy * len).toFixed(1));
          l.style.visibility = 'visible';
        });
      } else lines.forEach((l) => { l.style.visibility = 'hidden'; });

      // Impact bursts
      if (b === 0 && a >= 0.09 && a < 0.12) burstAt({ x: pose.p.x, y: pose.p.y + 0.3 * G.foot.h * pose.s }, 0.42 * G.foot.w * pose.s, stepA);
      else if (b >= 0.06 && b < 0.1) burstAt({ x: pose.p.x, y: pose.p.y + 0.3 * G.foot.h * pose.s }, 0.5 * G.foot.w * G.sC, stepB);
      else if (b >= 0.8 && b < 0.88) burstAt({ x: G.F.x - 0.02 * G.W, y: G.footTop }, 0.16 * G.W, stepB);
      else burst!.style.visibility = 'hidden';
    }

    function renderRaw(s: number) {
      hero!.style.setProperty('--p', seg(s, 0, PHASE.hero).toFixed(4));
      hero!.classList.toggle('is-revealed', seg(s, 0, PHASE.hero) >= 0.7);
      finale!.style.setProperty('--p', seg(s, START.white, START.white + PHASE.white).toFixed(4));
      prism!.style.setProperty('--spin', `${(-120 * faceAt(seg(s, START.prism, START.prism + PHASE.prism))).toFixed(2)}deg`);
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
      scrollTrigger: { start: () => pin.start, end: () => pin.end, scrub: 0.4, invalidateOnRefresh: true },
      onUpdate: () => renderSeq(proxy.s),
    });
    layout();
    renderRaw(pin.progress * TOTAL);
    proxy.s = pin.progress * TOTAL;
    renderSeq(proxy.s);

    return () => {
      stage.classList.remove('is-pinned', 'is-launched', 'is-split', 'is-landed');
      ['--bigtype', '--corner-o'].forEach((v) => stage.style.removeProperty(v));
      hero.style.removeProperty('--p');
      hero.classList.remove('is-revealed');
      finale.style.removeProperty('--p');
      prism.style.removeProperty('--spin');
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
