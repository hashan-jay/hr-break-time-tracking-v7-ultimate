import { useEffect, useRef } from 'react';

const ACTIVE_MODES = new Set(['rain', 'snow', 'ducks', 'birds', 'watermelon', 'orange', 'clowns', 'bananas', 'stars', 'weedpaper', 'joker']);
const FALLING_MODES = new Set(['ducks', 'watermelon', 'orange', 'clowns', 'bananas', 'stars', 'weedpaper', 'joker']);

function makeDrop(width, height, anywhere, mode) {
  if (mode === 'snow') {
    return {
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -10 - Math.random() * 40,
      size: 1.2 + Math.random() * 2.8,
      length: 0,
      speed: 0.45 + Math.random() * 1.35,
      drift: (Math.random() - 0.5) * 0.55,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.008 + Math.random() * 0.018,
      opacity: 0.38 + Math.random() * 0.45,
      face: 1,
    };
  }

  if (FALLING_MODES.has(mode)) {
    return {
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -30 - Math.random() * 80,
      size: 11 + Math.random() * 8,
      length: 0,
      speed: 0.7 + Math.random() * 1.1,
      drift: (Math.random() - 0.5) * 0.45,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.03,
      opacity: 1,
      face: Math.random() < 0.5 ? -1 : 1,
    };
  }

  if (mode === 'birds') {
    const face = Math.random() < 0.5 ? -1 : 1;
    return {
      x: anywhere ? Math.random() * width : (face > 0 ? -40 : width + 40),
      y: 24 + Math.random() * Math.max(40, height - 48),
      size: 10 + Math.random() * 8,
      length: 0,
      speed: 1.1 + Math.random() * 1.6,
      drift: (Math.random() - 0.5) * 0.15,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.12 + Math.random() * 0.16,
      opacity: 0.85 + Math.random() * 0.15,
      face,
    };
  }

  return {
    x: Math.random() * width,
    y: anywhere ? Math.random() * height : -20 - Math.random() * 80,
    size: 0,
    length: 10 + Math.random() * 16,
    speed: 7 + Math.random() * 8,
    drift: -0.8 - Math.random() * 0.7,
    wobble: 0,
    wobbleSpeed: 0,
    opacity: 0.28 + Math.random() * 0.4,
    face: 1,
  };
}

function drawDuck(ctx, x, y, size, tilt, face) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(face, 1);
  ctx.fillStyle = '#f5c518';
  ctx.beginPath();
  ctx.ellipse(size * 0.12, size * 0.08, size * 0.62, size * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-size * 0.38, -size * 0.28, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(-size * 0.62, -size * 0.24);
  ctx.lineTo(-size * 0.98, -size * 0.1);
  ctx.lineTo(-size * 0.6, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.arc(-size * 0.46, -size * 0.36, Math.max(1.1, size * 0.06), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-size * 0.48, -size * 0.38, Math.max(0.4, size * 0.02), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.ellipse(size * 0.16, size * 0.06, size * 0.24, size * 0.14, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBird(ctx, x, y, size, flap, face, opacity) {
  const wing = Math.sin(flap) * size * 0.85;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = '#1e293b';
  ctx.fillStyle = '#1e293b';
  ctx.lineWidth = Math.max(1.4, size * 0.11);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-size, wing);
  ctx.quadraticCurveTo(-size * 0.4, wing * 0.15, 0, 0);
  ctx.quadraticCurveTo(size * 0.4, wing * 0.15, size, wing);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, size * 0.05, size * 0.22, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.16, 0);
  ctx.lineTo(size * 0.42, -size * 0.08);
  ctx.lineTo(size * 0.16, size * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFalling(ctx, mode, x, y, size, tilt, face) {
  if (mode === 'ducks') {
    drawDuck(ctx, x, y, size, tilt, face);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  if (mode === 'watermelon') {
    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.7, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.52, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111827';
    for (const seed of [-0.22, 0, 0.22]) {
      ctx.beginPath();
      ctx.ellipse(size * seed, -size * 0.22, size * 0.045, size * 0.08, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (mode === 'orange') {
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = Math.max(1, size * 0.06);
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * size * 0.5, Math.sin(angle) * size * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff7ed';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (mode === 'clowns') {
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, -size * 0.42, size * 0.28, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(-size * 0.18, -size * 0.06, size * 0.07, 0, Math.PI * 2);
    ctx.arc(size * 0.18, -size * 0.06, size * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, size * 0.08, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = Math.max(1.2, size * 0.06);
    ctx.beginPath();
    ctx.arc(0, size * 0.16, size * 0.22, 0.15, Math.PI - 0.15);
    ctx.stroke();
  } else if (mode === 'bananas') {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = Math.max(3, size * 0.28);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, size * 0.1, size * 0.55, Math.PI * 0.85, Math.PI * 1.85);
    ctx.stroke();
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(Math.cos(Math.PI * 0.85) * size * 0.55, size * 0.1 + Math.sin(Math.PI * 0.85) * size * 0.55);
    ctx.lineTo(Math.cos(Math.PI * 0.85) * size * 0.55 - size * 0.12, size * 0.1 + Math.sin(Math.PI * 0.85) * size * 0.55 - size * 0.08);
    ctx.stroke();
  } else if (mode === 'stars') {
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const inner = angle + Math.PI / 5;
      const ox = Math.cos(angle) * size * 0.62;
      const oy = Math.sin(angle) * size * 0.62;
      const ix = Math.cos(inner) * size * 0.26;
      const iy = Math.sin(inner) * size * 0.26;
      if (i === 0) ctx.moveTo(ox, oy);
      else ctx.lineTo(ox, oy);
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fill();
  } else if (mode === 'weedpaper') {
    ctx.fillStyle = '#f8f1dc';
    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    ctx.roundRect(-size * 0.42, -size * 0.62, size * 0.84, size * 1.15, size * 0.08);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.02, size * 0.16, size * 0.28, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-size * 0.02, size * 0.04, size * 0.16, size * 0.28, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.22);
    ctx.lineTo(0, -size * 0.16);
    ctx.stroke();
  } else if (mode === 'joker') {
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, -size * 0.15);
    ctx.lineTo(-size * 0.85, -size * 0.85);
    ctx.lineTo(-size * 0.15, -size * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(size * 0.55, -size * 0.15);
    ctx.lineTo(size * 0.85, -size * 0.85);
    ctx.lineTo(size * 0.15, -size * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(-size * 0.72, -size * 0.72, size * 0.08, 0, Math.PI * 2);
    ctx.arc(size * 0.72, -size * 0.72, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = Math.max(1.2, size * 0.06);
    ctx.beginPath();
    ctx.ellipse(0, size * 0.08, size * 0.48, size * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.ellipse(-size * 0.18, -size * 0.02, size * 0.12, size * 0.16, -0.2, 0, Math.PI * 2);
    ctx.ellipse(size * 0.18, -size * 0.02, size * 0.12, size * 0.16, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = Math.max(1.4, size * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, size * 0.18, size * 0.2, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  ctx.restore();
}

export default function DialogWeather({ mode }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;
    if (!ACTIVE_MODES.has(mode)) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduceMotion.matches) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let frame = 0;
    let drops = [];
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const density = mode === 'rain' ? 7000 : mode === 'snow' ? 9000 : mode === 'birds' ? 42000 : mode === 'stars' ? 18000 : 28000;
      const cap = mode === 'rain' ? 180 : mode === 'snow' ? 140 : mode === 'birds' ? 14 : mode === 'stars' ? 36 : 28;
      const count = Math.round(Math.min(cap, Math.max(mode === 'birds' ? 8 : 16, (width * height) / density)));
      drops = Array.from({ length: count }, () => makeDrop(width, height, true, mode));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const drop of drops) {
        if (mode === 'snow') {
          drop.wobble += drop.wobbleSpeed;
          drop.y += drop.speed;
          drop.x += drop.drift + Math.sin(drop.wobble) * 0.4;
          if (drop.y > height + 12) Object.assign(drop, makeDrop(width, height, false, mode));
          if (drop.x < -12) drop.x = width + 6;
          if (drop.x > width + 12) drop.x = -6;
          ctx.beginPath();
          ctx.fillStyle = `rgba(176, 208, 236, ${drop.opacity})`;
          ctx.arc(drop.x, drop.y, drop.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.95, drop.opacity + 0.3)})`;
          ctx.arc(drop.x - drop.size * 0.28, drop.y - drop.size * 0.28, drop.size * 0.42, 0, Math.PI * 2);
          ctx.fill();
        } else if (FALLING_MODES.has(mode)) {
          drop.wobble += drop.wobbleSpeed;
          drop.y += drop.speed;
          drop.x += drop.drift + Math.sin(drop.wobble) * 0.6;
          if (drop.y > height + drop.size) Object.assign(drop, makeDrop(width, height, false, mode));
          if (drop.x < -drop.size * 2) drop.x = width + drop.size;
          if (drop.x > width + drop.size * 2) drop.x = -drop.size;
          drawFalling(ctx, mode, drop.x, drop.y, drop.size, Math.sin(drop.wobble) * 0.35, drop.face);
        } else if (mode === 'birds') {
          drop.wobble += drop.wobbleSpeed;
          drop.x += drop.speed * drop.face;
          drop.y += Math.sin(drop.wobble) * 0.35;
          if (drop.face > 0 && drop.x > width + 50) Object.assign(drop, makeDrop(width, height, false, mode));
          if (drop.face < 0 && drop.x < -50) Object.assign(drop, makeDrop(width, height, false, mode));
          if (drop.y < 16) drop.y = 16;
          if (drop.y > height - 16) drop.y = height - 16;
          drawBird(ctx, drop.x, drop.y, drop.size, drop.wobble, drop.face, drop.opacity);
        } else {
          drop.y += drop.speed;
          drop.x += drop.drift;
          if (drop.y > height + drop.length) Object.assign(drop, makeDrop(width, height, false, mode));
          if (drop.x < -20) drop.x = width + 10;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(96, 145, 186, ${drop.opacity})`;
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x + drop.drift * 1.6, drop.y + drop.length);
          ctx.stroke();
        }
      }
      frame = requestAnimationFrame(draw);
    };

    resize();
    frame = requestAnimationFrame(draw);
    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [mode]);

  if (!ACTIVE_MODES.has(mode)) return null;

  return <canvas ref={canvasRef} className="portal-employee-weather" aria-hidden="true" />;
}
