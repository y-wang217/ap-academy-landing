/**
 * The cinematic horizon (REQ-55, VISUAL_DIRECTION A): sky, sun, skyline and
 * water as inline SVG, adapted from the handoff's bridge-skyline.svg. Text-free
 * and decorative. The skyline is drawn from a fixed seed, so the server and the
 * client render the same buildings. console.css sets the height, collapses it
 * to a strip at 900 px and hides it at 640 px.
 */
type Block = { x: number; y: number; w: number; h: number };

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function skyline(seed: number, count: number, base: number, minH: number, maxH: number, minW: number, maxW: number): Block[] {
  const rnd = seeded(seed);
  return Array.from({ length: count }, () => {
    const w = Math.round(minW + rnd() * (maxW - minW));
    const h = Math.round(minH + rnd() * (maxH - minH));
    return { x: Math.round(rnd() * 1960) - 20, y: base - h, w, h };
  });
}

const FAR = skyline(7, 70, 246, 36, 124, 15, 50);
const NEAR = skyline(29, 46, 283, 35, 93, 24, 80);
const LIGHTS = ["#62B9C0", "#FCB678", "#FF8468", "#E66988"];
const WINDOWS = NEAR.flatMap((b, i) => {
  const rnd = seeded(101 + i);
  return Array.from({ length: Math.max(1, Math.floor(b.h / 16)) }, (_, j) => ({
    x: b.x + 6 + Math.floor(rnd() * Math.max(1, (b.w - 12) / 10)) * 10,
    y: b.y + 10 + j * 12,
    fill: LIGHTS[Math.floor(rnd() * LIGHTS.length)],
  }));
});

export function Horizon() {
  return (
    <div data-horizon="" className="console-horizon" aria-hidden="true">
      <svg viewBox="0 0 1920 310" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id="console-sky" x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="#250F33" />
            <stop offset=".45" stopColor="#8A2B62" />
            <stop offset=".82" stopColor="#F16A70" />
            <stop offset="1" stopColor="#F7A471" />
          </linearGradient>
          <radialGradient id="console-sun">
            <stop offset="0" stopColor="#FFE5A8" />
            <stop offset=".75" stopColor="#FFC075" />
            <stop offset="1" stopColor="#EF7B75" />
          </radialGradient>
          <linearGradient id="console-water" x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="#CB4869" />
            <stop offset="1" stopColor="#241227" />
          </linearGradient>
          <filter id="console-glow">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>
        <rect width="1920" height="310" fill="url(#console-sky)" />
        <circle cx="1170" cy="165" r="160" fill="#FFB682" opacity=".48" filter="url(#console-glow)" />
        <circle cx="1170" cy="165" r="142" fill="url(#console-sun)" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="1020" y={170 + i * 16} width="300" height={3 + i * 2} fill="#8A2B62" opacity=".55" />
        ))}
        <path d="M0 244 Q600 229 950 238 T1920 236 V310 H0Z" fill="url(#console-water)" />
        {FAR.map((b, i) => (
          <rect key={`f${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="#50203F" />
        ))}
        {NEAR.map((b, i) => (
          <rect key={`n${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="#190F24" />
        ))}
        {WINDOWS.map((w, i) => (
          <rect key={`w${i}`} x={w.x} y={w.y} width="3" height="3" fill={w.fill} opacity=".7" />
        ))}
        <rect y="283" width="1920" height="27" fill="#140D1C" />
      </svg>
    </div>
  );
}
