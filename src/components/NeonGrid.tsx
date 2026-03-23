import { useRef, useEffect } from 'react';

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
 * Renders to a <canvas> — event-driven, zero CPU when idle.
 * pointer-events: none — it never blocks clicks.
 */
const CURSOR_OFFSCREEN = { x: -9999, y: -9999 };

export function NeonGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef(CURSOR_OFFSCREEN);
  const pendingRef = useRef(false);
  const rafIdRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
      pendingRef.current = false;
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
            const t = 1 - dist / INFLUENCE_RADIUS;
            const ease = t * t;
            const push = ease * PUSH_STRENGTH;

            if (dist > 0.1) {
              drawX += (dx / dist) * push;
              drawY += (dy / dist) * push;
            }

            color = DOT_COLOR_BRIGHT;
            radius = DOT_RADIUS + ease * 0.6;
          }

          ctx.beginPath();
          ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    }

    function scheduleFrame() {
      if (!pendingRef.current) {
        pendingRef.current = true;
        rafIdRef.current = requestAnimationFrame(draw);
      }
    }

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      scheduleFrame();
    }

    function onMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      scheduleFrame();
    }

    // document (not window) — fires reliably when cursor leaves the viewport
    function onMouseLeave() {
      mouseRef.current = CURSOR_OFFSCREEN;
      scheduleFrame();
    }

    resize();
    scheduleFrame(); // Initial static grid render

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="neon-grid-canvas"
      style={{ pointerEvents: 'none' }}
    />
  );
}
