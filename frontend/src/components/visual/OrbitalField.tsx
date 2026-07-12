"use client";

import { useEffect, useRef } from "react";

/**
 * OrbitalField — the "liquidity reactor".
 *
 * A hand-rolled 3D scene (no three.js): three tilted particle rings orbit a
 * pulsing core, with nearby particles linked by fading lines. True perspective
 * projection with painter-sorted depth, mouse parallax tilts the camera.
 */

type P3 = { x: number; y: number; z: number };

const SPECTRUM = [
  [70, 245, 201],   // mint
  [88, 168, 255],   // azure
  [157, 123, 255],  // violet
];

export function OrbitalField({ height = 560 }: { height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0, H = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // ── Build rings ──────────────────────────────────────────────────────────
    interface Particle {
      angle: number; speed: number; radius: number; wobble: number;
      ring: number; size: number; color: number[];
    }
    const RINGS = [
      { tiltX: 1.05, tiltZ: 0.25, radius: 150, count: 46, speed: 0.0022 },
      { tiltX: 0.55, tiltZ: -0.6, radius: 210, count: 60, speed: -0.0015 },
      { tiltX: 1.45, tiltZ: 0.9,  radius: 265, count: 72, speed: 0.001 },
    ];
    const particles: Particle[] = [];
    RINGS.forEach((r, ri) => {
      for (let i = 0; i < r.count; i++) {
        particles.push({
          angle: (i / r.count) * Math.PI * 2,
          speed: r.speed * (0.85 + Math.random() * 0.3),
          radius: r.radius * (0.96 + Math.random() * 0.08),
          wobble: Math.random() * Math.PI * 2,
          ring: ri,
          size: 1.2 + Math.random() * 2.2,
          color: SPECTRUM[ri % 3],
        });
      }
    });

    // free-floating dust
    interface Dust { p: P3; v: P3; size: number }
    const dust: Dust[] = Array.from({ length: 90 }, () => ({
      p: { x: (Math.random() - 0.5) * 700, y: (Math.random() - 0.5) * 500, z: (Math.random() - 0.5) * 700 },
      v: { x: (Math.random() - 0.5) * 0.12, y: (Math.random() - 0.5) * 0.12, z: (Math.random() - 0.5) * 0.12 },
      size: 0.5 + Math.random() * 1.2,
    }));

    // mouse parallax
    let mx = 0, my = 0, tmx = 0, tmy = 0;
    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      tmx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      tmy = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouse, { passive: true });

    const FOV = 620;
    const project = (p: P3, camRotY: number, camRotX: number) => {
      // rotate around Y then X (camera orbit)
      let x = p.x * Math.cos(camRotY) - p.z * Math.sin(camRotY);
      let z = p.x * Math.sin(camRotY) + p.z * Math.cos(camRotY);
      let y = p.y * Math.cos(camRotX) - z * Math.sin(camRotX);
      z = p.y * Math.sin(camRotX) + z * Math.cos(camRotX);
      const s = FOV / (FOV + z + 340);
      return { sx: W / 2 + x * s, sy: H / 2 + y * s, s, z };
    };

    let raf = 0;
    let running = true;
    let t = 0;

    const frame = () => {
      if (!running) return;
      t += 1;
      mx += (tmx - mx) * 0.04;
      my += (tmy - my) * 0.04;

      ctx.clearRect(0, 0, W, H);

      const camRotY = t * 0.0012 + mx * 0.35;
      const camRotX = -0.18 + my * 0.22;

      // ── core glow ──────────────────────────────────────────────────────────
      const pulse = 1 + 0.06 * Math.sin(t * 0.02);
      const core = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 130 * pulse);
      core.addColorStop(0, "rgba(120, 235, 220, 0.55)");
      core.addColorStop(0.25, "rgba(88, 168, 255, 0.28)");
      core.addColorStop(0.6, "rgba(157, 123, 255, 0.10)");
      core.addColorStop(1, "rgba(157, 123, 255, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 130 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // inner nucleus
      const nucleus = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 26 * pulse);
      nucleus.addColorStop(0, "rgba(235, 255, 250, 0.95)");
      nucleus.addColorStop(0.5, "rgba(70, 245, 201, 0.55)");
      nucleus.addColorStop(1, "rgba(70, 245, 201, 0)");
      ctx.fillStyle = nucleus;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 26 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // ── compute particle positions ─────────────────────────────────────────
      const projected: { sx: number; sy: number; s: number; z: number; p: Particle }[] = [];
      for (const p of particles) {
        p.angle += reduced ? 0 : p.speed;
        const ring = RINGS[p.ring];
        const wob = Math.sin(t * 0.01 + p.wobble) * 7;
        // ring-local circle
        let x = Math.cos(p.angle) * (p.radius + wob);
        let y = Math.sin(p.angle) * (p.radius + wob);
        let z = 0;
        // tilt ring: rotate about X then Z
        let y2 = y * Math.cos(ring.tiltX);
        let z2 = y * Math.sin(ring.tiltX);
        let x3 = x * Math.cos(ring.tiltZ) - y2 * Math.sin(ring.tiltZ);
        let y3 = x * Math.sin(ring.tiltZ) + y2 * Math.cos(ring.tiltZ);
        const pr = project({ x: x3, y: y3, z: z2 }, camRotY, camRotX);
        projected.push({ ...pr, p });
      }

      // links between close particles on the same ring
      ctx.lineWidth = 0.6;
      for (let i = 0; i < projected.length; i++) {
        const a = projected[i];
        for (let j = i + 1; j < Math.min(i + 5, projected.length); j++) {
          const b = projected[j];
          if (a.p.ring !== b.p.ring) continue;
          const dx = a.sx - b.sx, dy = a.sy - b.sy;
          const d2 = dx * dx + dy * dy;
          if (d2 < 3600) {
            const alpha = (1 - d2 / 3600) * 0.35 * Math.min(a.s, b.s);
            const [r, g, bl] = a.p.color;
            ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      // painter sort: far first
      projected.sort((a, b) => b.z - a.z);
      for (const q of projected) {
        const [r, g, b] = q.p.color;
        const alpha = Math.max(0.08, Math.min(0.95, (q.s - 0.45) * 1.8));
        const size = q.p.size * q.s * 1.6;
        // glow halo
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.18})`;
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, size * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // dust
      for (const d of dust) {
        if (!reduced) {
          d.p.x += d.v.x; d.p.y += d.v.y; d.p.z += d.v.z;
          if (Math.abs(d.p.x) > 380) d.v.x *= -1;
          if (Math.abs(d.p.y) > 280) d.v.y *= -1;
          if (Math.abs(d.p.z) > 380) d.v.z *= -1;
        }
        const pr = project(d.p, camRotY, camRotX);
        const alpha = Math.max(0, Math.min(0.5, (pr.s - 0.5) * 1.2));
        ctx.fillStyle = `rgba(148, 190, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, d.size * pr.s, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduced) raf = requestAnimationFrame(frame);
    };
    frame();

    const onVis = () => {
      running = !document.hidden;
      if (running && !reduced) frame();
      else cancelAnimationFrame(raf);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ width: "100%", height, display: "block", pointerEvents: "none" }}
    />
  );
}
