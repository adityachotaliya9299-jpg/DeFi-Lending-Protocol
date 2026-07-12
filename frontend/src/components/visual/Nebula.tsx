"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";

/**
 * Nebula — full-viewport WebGL aurora background.
 *
 * Hand-written fragment shader: 3-octave fbm noise advected over time forms
 * slow bioluminescent ribbons in the LendFi spectrum (mint → azure → violet),
 * over a deep-space vignette with a sparse twinkling starfield.
 *
 * - Fixed behind all content (z-index 0), pointer-events none
 * - Pauses when the tab is hidden; respects prefers-reduced-motion
 * - Falls back to a static CSS gradient when WebGL is unavailable
 */

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_light; // 1.0 = light theme

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.55;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 q = uv * vec2(u_res.x / u_res.y, 1.0);
  float t = u_time * 0.035;

  // domain-warped fbm: two layers of drift
  vec2 w1 = vec2(fbm(q * 1.6 + vec2(t, -t * 0.7)), fbm(q * 1.6 + vec2(-t * 0.8, t)));
  float rib = fbm(q * 2.2 + 1.8 * w1 + vec2(t * 0.5, 0.0));

  // aurora ribbons concentrated near a slow-moving diagonal band
  float band = smoothstep(0.55, 0.0, abs(uv.y - 0.35 - 0.25 * sin(t * 0.9 + uv.x * 2.4) - (uv.x - 0.5) * 0.22));
  float glow = pow(rib, 2.2) * band;

  // spectrum: mint -> azure -> violet across x + noise
  vec3 mint   = vec3(0.27, 0.96, 0.79);
  vec3 azure  = vec3(0.34, 0.66, 1.00);
  vec3 violet = vec3(0.62, 0.48, 1.00);
  float mixv = clamp(uv.x + 0.35 * (rib - 0.5), 0.0, 1.0);
  vec3 spectrum = mix(mint, azure, smoothstep(0.0, 0.55, mixv));
  spectrum = mix(spectrum, violet, smoothstep(0.55, 1.0, mixv));

  // base deep-space gradient with vignette
  vec3 deep = mix(vec3(0.004, 0.010, 0.030), vec3(0.012, 0.028, 0.060), uv.y);
  float vig = smoothstep(1.25, 0.35, length(uv - vec2(0.5, 0.42)));

  vec3 col = deep + spectrum * glow * 0.55 * vig;

  // secondary faint counter-ribbon (violet, top right)
  float band2 = smoothstep(0.4, 0.0, abs(uv.y - 0.8 + 0.15 * cos(t * 0.7 + uv.x * 3.0)));
  col += violet * pow(fbm(q * 3.0 - w1 + t * 0.3), 2.6) * band2 * 0.22 * vig;

  // starfield: sparse, twinkling
  vec2 sp = gl_FragCoord.xy / 2.2;
  float star = step(0.9985, hash(floor(sp)));
  float tw = 0.5 + 0.5 * sin(u_time * (0.6 + hash(floor(sp) + 7.0) * 2.2) + hash(floor(sp) * 3.0) * 6.28);
  col += vec3(0.75, 0.85, 1.0) * star * tw * 0.5 * (1.0 - u_light);

  // light theme: invert into an airy paper glow
  vec3 lightBase = mix(vec3(0.930, 0.945, 0.980), vec3(0.955, 0.965, 0.990), uv.y);
  vec3 lightCol = lightBase - spectrum * glow * 0.16 * vig - violet * band2 * 0.05;
  col = mix(col, lightCol, u_light);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function Nebula() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const lightRef = useRef(0);
  lightRef.current = theme === "light" ? 1 : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return; // CSS fallback stays visible

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uLight = gl.getUniformLocation(prog, "u_light");

    let raf = 0;
    let running = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      // render at reduced resolution — it's a blurred background, saves GPU
      const w = Math.floor(window.innerWidth * dpr * 0.66);
      const h = Math.floor(window.innerHeight * dpr * 0.66);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    const frame = () => {
      if (!running) return;
      const t = reduced ? 0 : (performance.now() - start) / 1000;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uLight, lightRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
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
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        // CSS fallback if WebGL is unavailable
        background:
          theme === "light"
            ? "radial-gradient(120% 90% at 50% 0%, #eef3fb 0%, #e6ecf8 100%)"
            : "radial-gradient(120% 90% at 50% 0%, #071021 0%, #02040a 70%)",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", filter: "saturate(1.15)" }}
      />
      {/* fine grain overlay for texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: theme === "light" ? 0.25 : 0.5,
          mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
