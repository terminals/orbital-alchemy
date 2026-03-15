import { useRef, useEffect, useCallback } from 'react';

const GAP = 28;
const DOT_RADIUS = 1;
const DOT_COLOR = 'rgba(255, 255, 255, 0.12)';
const DOT_COLOR_BRIGHT = 'rgba(255, 255, 255, 0.35)';

// How far the cursor influence reaches (px)
const INFLUENCE_RADIUS = 180;
// How much dots get pushed away (px)
const PUSH_STRENGTH = 14;

/**
 * Full-screen dot grid that warps around the cursor.
 * Renders to a <canvas> in a requestAnimationFrame loop.
 * pointer-events: none — it never blocks clicks.
 */
export function NeonGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const rafRef = useRef<number>(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size canvas to viewport
    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const r2 = INFLUENCE_RADIUS * INFLUENCE_RADIUS;

      const cols = Math.ceil(canvas.width / GAP) + 1;
      const rows = Math.ceil(canvas.height / GAP) + 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const baseX = col * GAP;
          const baseY = row * GAP;

          const dx = baseX - mx;
          const dy = baseY - my;
          const dist2 = dx * dx + dy * dy;

          let drawX = baseX;
          let drawY = baseY;
          let color = DOT_COLOR;
          let radius = DOT_RADIUS;

          if (dist2 < r2) {
            const dist = Math.sqrt(dist2);
            // Smooth falloff: strongest at center, zero at edge
            const t = 1 - dist / INFLUENCE_RADIUS;
            const ease = t * t; // quadratic easing
            const push = ease * PUSH_STRENGTH;

            if (dist > 0.1) {
              drawX += (dx / dist) * push;
              drawY += (dy / dist) * push;
            }

            // Brighten dots near cursor
            color = DOT_COLOR_BRIGHT;
            radius = DOT_RADIUS + ease * 0.6;
          }

          ctx.beginPath();
          ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseMove]);

  return (
    <canvas
      ref={canvasRef}
      className="neon-grid-canvas"
      style={{ pointerEvents: 'none' }}
    />
  );
}
