import { useRef, useEffect } from 'react';

const GAP = 28;
const DOT_RADIUS = 1;
const BASE_OPACITY = 0.12;
const BRIGHT_OPACITY = 0.6;
const DOT_COLOR = `rgba(255, 255, 255, ${BASE_OPACITY})`;

// How far the cursor influence reaches (px)
const INFLUENCE_RADIUS = 300;
// How much dots get pushed away (px)
const PUSH_STRENGTH = 14;

// ── Effect toggles ──
const ENABLE_ORB_TINT = true;
const ENABLE_CONSTELLATION_LINES = true;
const ENABLE_VELOCITY_RESPONSE = true;
const ENABLE_EMP_PULSE = true;
const ENABLE_GRAVITY_WELL = true;
const ENABLE_VORTEX = false;
const ENABLE_SHOCKWAVE = true;

// ── Constellation lines config ──
const LINE_MAX_DIST = GAP * 1.8;
const LINE_MAX_DIST2 = LINE_MAX_DIST * LINE_MAX_DIST;

// ── Gravity well config ──
const GRAVITY_MIN_RADIUS = 80;

const GRAVITY_FULL_SCREEN_TIME = 10000; // ms to reach full screen
const GRAVITY_SNAP_DURATION = 800; // longer for rubber band + shockwave

// ── Shockwave config ──
const SHOCK_SPEED = 500; // px per second
const SHOCK_WIDTH = 50; // thin ring
const SHOCK_PUSH = 22; // hard displacement
const SHOCK_DURATION = 4000; // total effect time


// ── Vortex config ──
const VORTEX_MIN_RADIUS = 100;
const VORTEX_FULL_SCREEN_TIME = 8000; // ms to reach full screen
const VORTEX_MAX_ROTATION = Math.PI * 4; // max spin at center after full hold
const VORTEX_SNAP_DURATION = 1000;

const CURSOR_OFFSCREEN = { x: -9999, y: -9999 };

interface GravityState {
  x: number;
  y: number;
  startTime: number;
  releaseTime: number; // 0 = held
  holdStrength: number; // cached strength at release
  holdRadius: number; // cached radius at release
}

export function NeonGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef(CURSOR_OFFSCREEN);
  const pendingRef = useRef(false);
  const rafIdRef = useRef(0);
  const prevMouseRef = useRef(CURSOR_OFFSCREEN);
  const velocityRef = useRef(0);
  const gravityRef = useRef<GravityState | null>(null);
  const shockwavesRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingClickRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
      pendingRef.current = false;
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Reduce motion: static grid only, no effects
      const reducedMotion = document.documentElement.hasAttribute('data-reduce-motion');
      if (reducedMotion) {
        const cols = Math.ceil(canvas.width / GAP) + 1;
        const rows = Math.ceil(canvas.height / GAP) + 1;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            ctx.beginPath();
            ctx.arc(col * GAP, row * GAP, DOT_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = DOT_COLOR;
            ctx.fill();
          }
        }
        return;
      }

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const r2 = INFLUENCE_RADIUS * INFLUENCE_RADIUS;
      const now = performance.now();

      // Velocity
      let vel = 0;
      if (ENABLE_VELOCITY_RESPONSE) {
        const pmx = prevMouseRef.current.x;
        const pmy = prevMouseRef.current.y;
        if (pmx > -9000) {
          const vdx = mx - pmx;
          const vdy = my - pmy;
          const speed = Math.sqrt(vdx * vdx + vdy * vdy);
          const raw = Math.min(1, speed / 60);
          velocityRef.current = velocityRef.current * 0.7 + raw * 0.3;
        }
        prevMouseRef.current = { x: mx, y: my };
        vel = velocityRef.current;
      }
      const velPush = 1 + vel * 2;
      const velBright = 1 + vel * 0.6;

      // EMP pulse
      let empRingRadius = -1;
      let empStrength = 0;
      if (ENABLE_EMP_PULSE && mx > -9000) {
        const phase = now % 2000;
        empRingRadius = (phase / 1000) * 400;
        const maxR = INFLUENCE_RADIUS * 2;
        empStrength = empRingRadius < maxR ? 1 - empRingRadius / maxR : 0;
      }

      // Gravity well state
      const screenDiag = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
      const grav = gravityRef.current;
      let gravStrength = 0; // 0–1, how far through the ramp
      let gravActive = false;
      if (ENABLE_GRAVITY_WELL && grav) {
        if (grav.releaseTime === 0) {
          // Holding — unbounded ramp toward full screen
          gravStrength = Math.min(1, (now - grav.startTime) / GRAVITY_FULL_SCREEN_TIME);
          gravActive = true;
        } else {
          // Released — snap back
          const sinceRelease = now - grav.releaseTime;
          if (sinceRelease < GRAVITY_SNAP_DURATION) {
            gravStrength = grav.holdStrength * (1 - sinceRelease / GRAVITY_SNAP_DURATION);
            gravActive = true;
          } else {
            gravityRef.current = null;
          }
        }
      }
      const gravRadius = GRAVITY_MIN_RADIUS + gravStrength * (screenDiag - GRAVITY_MIN_RADIUS);
      const isReleased = grav?.releaseTime !== 0;

      // Vortex state (reuses gravityRef)
      let vortexStrength = 0;
      let vortexActive = false;
      let vortexRadius = 0;
      let vortexReleased = false;
      let vortexOscillation = 0;
      if (ENABLE_VORTEX && grav) {
        if (grav.releaseTime === 0) {
          vortexStrength = Math.min(1, (now - grav.startTime) / VORTEX_FULL_SCREEN_TIME);
          vortexActive = true;
        } else {
          const sinceRelease = now - grav.releaseTime;
          if (sinceRelease < VORTEX_SNAP_DURATION) {
            const t = sinceRelease / VORTEX_SNAP_DURATION;
            const decay = Math.exp(-t * 4);
            vortexOscillation = Math.sin(t * Math.PI * 3) * decay;
            vortexStrength = grav.holdStrength;
            vortexActive = true;
            vortexReleased = true;
          } else {
            gravityRef.current = null;
          }
        }
        vortexRadius = VORTEX_MIN_RADIUS + vortexStrength * (screenDiag - VORTEX_MIN_RADIUS);
      }

      // Shockwave cleanup
      const shocks = shockwavesRef.current.filter(s => now - s.time < SHOCK_DURATION);
      shockwavesRef.current = shocks;

      const cols = Math.ceil(canvas.width / GAP) + 1;
      const rows = Math.ceil(canvas.height / GAP) + 1;

      // Pre-compute orb positions once
      const cyanOrbX = canvas.width * 0.1 + 450;
      const cyanOrbY = 100;
      const pinkOrbX = canvas.width - 350;
      const pinkOrbY = canvas.height - 100;
      const orbRadius = 600;

      const activeDots: { x: number; y: number; ease: number }[] = [];
      let needsAnim = (ENABLE_EMP_PULSE && mx > -9000) || gravActive || vortexActive || shocks.length > 0;

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

          // EMP pulse ring
          if (empStrength > 0 && dist2 > 0.01) {
            const dist = Math.sqrt(dist2);
            const ringDist = Math.abs(dist - empRingRadius);
            if (ringDist < 60) {
              const s = (1 - ringDist / 60) * empStrength;
              drawX += (dx / dist) * s * 8;
              drawY += (dy / dist) * s * 8;
              color = `rgba(255, 255, 255, ${BASE_OPACITY + s * 0.2})`;
              radius = DOT_RADIUS + s * 0.5;
            }
          }

          // Gravity well — pull dots toward center as fraction of their distance
          if (gravActive && grav) {
            const gdx = baseX - grav.x;
            const gdy = baseY - grav.y;
            const gDist2 = gdx * gdx + gdy * gdy;
            // Use holdRadius for release phase so dots outside original pull range still snap back
            const checkR = isReleased ? grav.holdRadius : gravRadius;
            const checkR2 = checkR * checkR;
            if (gDist2 < checkR2 && gDist2 > 0.01) {
              const gDist = Math.sqrt(gDist2);
              const proximity = 1 - gDist / checkR;
              const pullEase = proximity * proximity * proximity;
              // Edge resistance
              const edgeMargin = 150;
              const edgeX = Math.min(baseX, canvas.width - baseX) / edgeMargin;
              const edgeY = Math.min(baseY, canvas.height - baseY) / edgeMargin;
              const edgeResist = Math.min(1, Math.min(edgeX, edgeY));

              if (isReleased) {
                // Rubber band: overshoot past home, then damped oscillation
                const sinceRelease = now - grav.releaseTime;
                const t = sinceRelease / GRAVITY_SNAP_DURATION;
                // Damped sine — shoots outward, bounces back, settles
                const decay = Math.exp(-t * 4);
                const oscillation = Math.sin(t * Math.PI * 3) * decay;
                // At t=0 oscillation is positive (push out), then bounces
                const snapFraction = grav.holdStrength * pullEase * edgeResist * oscillation;
                drawX += gdx * snapFraction * 0.8;
                drawY += gdy * snapFraction * 0.8;
                // Flash bright on release, fade with decay
                const glow = pullEase * Math.abs(oscillation) * 0.5;
                color = `rgba(255, 255, 255, ${Math.min(1, BASE_OPACITY + glow)})`;
                radius = DOT_RADIUS + pullEase * Math.abs(oscillation) * 1.2;
              } else {
                const pullFraction = gravStrength * pullEase * edgeResist * 0.95;
                drawX -= gdx * pullFraction;
                drawY -= gdy * pullFraction;
                const glow = pullEase * gravStrength * 0.3;
                color = `rgba(255, 255, 255, ${BASE_OPACITY + glow})`;
                radius = DOT_RADIUS + pullEase * gravStrength * 0.8;
              }
            }
          }

          // Vortex spin
          if (vortexActive && grav) {
            const vdx = baseX - grav.x;
            const vdy = baseY - grav.y;
            const vDist2 = vdx * vdx + vdy * vdy;
            const vCheckR = vortexReleased ? grav.holdRadius : vortexRadius;
            if (vDist2 < vCheckR * vCheckR && vDist2 > 0.01) {
              const vDist = Math.sqrt(vDist2);
              const proximity = 1 - vDist / vCheckR;
              const spinEase = proximity * proximity;
              // Edge resistance
              const edgeMargin = 150;
              const edgeX = Math.min(baseX, canvas.width - baseX) / edgeMargin;
              const edgeY = Math.min(baseY, canvas.height - baseY) / edgeMargin;
              const edgeResist = Math.min(1, Math.min(edgeX, edgeY));

              let angle: number;
              if (vortexReleased) {
                // Unwind with rubber band oscillation
                angle = spinEase * VORTEX_MAX_ROTATION * vortexStrength * edgeResist * vortexOscillation * -1;
              } else {
                // Wind up progressively
                angle = spinEase * VORTEX_MAX_ROTATION * vortexStrength * edgeResist;
              }

              const cos = Math.cos(angle);
              const sin = Math.sin(angle);
              const rx = vdx * cos - vdy * sin;
              const ry = vdx * sin + vdy * cos;
              drawX = grav.x + rx;
              drawY = grav.y + ry;

              const glow = spinEase * vortexStrength * 0.3;
              color = `rgba(255, 255, 255, ${BASE_OPACITY + glow})`;
              radius = DOT_RADIUS + spinEase * vortexStrength * 0.6;
            }
          }

          // Shockwave crack — spacetime warp
          if (ENABLE_SHOCKWAVE) {
            for (const shock of shocks) {
              const sdx = baseX - shock.x;
              const sdy = baseY - shock.y;
              const sDist2 = sdx * sdx + sdy * sdy;
              if (sDist2 < 0.01) continue;
              const sDist = Math.sqrt(sDist2);
              const elapsed = now - shock.time;
              const ringPos = (elapsed / 1000) * SHOCK_SPEED;
              const distFade = Math.max(0, 1 - ringPos / screenDiag);

              // Unit vectors: radial + tangent
              const ux = sdx / sDist;
              const uy = sdy / sDist;
              const tx = -uy;
              const ty = ux;

              // Single wave profile centered on ringPos
              const w = SHOCK_WIDTH;
              const ringDist = sDist - ringPos;

              if (Math.abs(ringDist) < w * 2) {
                // Normalized position in wave: -1 (trailing) to +1 (leading)
                const t = ringDist / (w * 2);
                const envelope = Math.max(0, 1 - Math.abs(t)) * distFade;

                // Radial push peaks at wave center, compression ahead, stretch behind
                const radialPush = Math.cos(t * Math.PI * 0.5) * envelope * SHOCK_PUSH;
                drawX += ux * radialPush;
                drawY += uy * radialPush;

                // Tangential warp — antisymmetric sine, twists grid
                const warp = Math.sin(t * Math.PI) * envelope * 14;
                drawX += tx * warp;
                drawY += ty * warp;

                // Brightness on the wavefront
                color = `rgba(255, 255, 255, ${Math.min(1, BASE_OPACITY + envelope * 0.5)})`;
                radius = DOT_RADIUS + envelope * 1.0;
              }
            }
          }

          // Cursor hover influence
          let ease = 0;
          if (dist2 < r2) {
            const dist = Math.sqrt(dist2);
            const t = 1 - dist / INFLUENCE_RADIUS;
            ease = t * t;
            const push = ease * PUSH_STRENGTH * velPush;

            if (dist > 0.1) {
              drawX += (dx / dist) * push;
              drawY += (dy / dist) * push;
            }

            const opacity = Math.min(1, BASE_OPACITY + ease * (BRIGHT_OPACITY - BASE_OPACITY) * velBright);
            radius = DOT_RADIUS + ease * 0.6;

            if (ENABLE_ORB_TINT) {
              const dcx = baseX - cyanOrbX;
              const dcy = baseY - cyanOrbY;
              const cyanDist = Math.sqrt(dcx * dcx + dcy * dcy);
              const cyanInfl = Math.max(0, 1 - cyanDist / orbRadius);

              const dpx = baseX - pinkOrbX;
              const dpy = baseY - pinkOrbY;
              const pinkDist = Math.sqrt(dpx * dpx + dpy * dpy);
              const pinkInfl = Math.max(0, 1 - pinkDist / orbRadius);

              const tintStrength = ease * ease;
              const sat = 1 + ease * 2;
              const cr = Math.min(1, tintStrength * pinkInfl * sat);
              const pr = Math.min(1, tintStrength * cyanInfl * sat);

              const dotR = Math.round(255 - cr * 255 + pr * (233 - 255));
              const dotG = Math.round(255 - cr * (255 - 188) - pr * (255 - 30));
              const dotB = Math.round(255 - cr * (255 - 212) - pr * (255 - 99));
              color = `rgba(${Math.max(0, Math.min(255, dotR))}, ${Math.max(0, Math.min(255, dotG))}, ${Math.max(0, Math.min(255, dotB))}, ${opacity})`;
            } else {
              color = `rgba(255, 255, 255, ${opacity})`;
            }
          }

          if (ENABLE_CONSTELLATION_LINES && ease > 0.05) {
            activeDots.push({ x: drawX, y: drawY, ease });
          }

          ctx.beginPath();
          ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }

      // Constellation lines
      if (ENABLE_CONSTELLATION_LINES && activeDots.length > 1) {
        for (let i = 0; i < activeDots.length; i++) {
          for (let j = i + 1; j < activeDots.length; j++) {
            const a = activeDots[i];
            const b = activeDots[j];
            const ldx = a.x - b.x;
            const ldy = a.y - b.y;
            const ld2 = ldx * ldx + ldy * ldy;
            if (ld2 < LINE_MAX_DIST2) {
              const proximity = 1 - Math.sqrt(ld2) / LINE_MAX_DIST;
              const strength = Math.min(a.ease, b.ease) * proximity;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.strokeStyle = `rgba(255, 255, 255, ${strength * 0.25})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
      }

      // Keep animation loop alive when needed
      if (needsAnim) {
        pendingRef.current = true;
        rafIdRef.current = requestAnimationFrame(draw);
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
      // Update gravity position to follow cursor while held
      const grav = gravityRef.current;
      if (grav && grav.releaseTime === 0) {
        grav.x = e.clientX;
        grav.y = e.clientY;
      }
      scheduleFrame();
    }

    function onMouseLeave() {
      mouseRef.current = CURSOR_OFFSCREEN;
      scheduleFrame();
    }

    const HOLD_THRESHOLD = 200; // ms — under = click (shockwave), over = hold (gravity)

    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Skip interactive elements — anything clickable or selectable
      const isInteractive = target.closest('button, a, input, select, textarea, [role="button"], [role="option"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], [role="switch"], [role="link"], [role="search"], [data-clickable], [onclick], label');
      const hasCursorPointer = window.getComputedStyle(target).cursor === 'pointer';
      if (isInteractive || hasCursorPointer) return;

      const now = performance.now();
      pendingClickRef.current = { x: e.clientX, y: e.clientY, time: now };

      // After threshold, start gravity well (cancel shockwave)
      if (ENABLE_GRAVITY_WELL || ENABLE_VORTEX) {
        holdTimerRef.current = setTimeout(() => {
          pendingClickRef.current = null; // consumed as hold
          gravityRef.current = { x: e.clientX, y: e.clientY, startTime: now, releaseTime: 0, holdStrength: 0, holdRadius: GRAVITY_MIN_RADIUS };
          scheduleFrame();
        }, HOLD_THRESHOLD);
      }
    }

    function onMouseUp() {
      // Cancel hold timer if still pending
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }

      const pending = pendingClickRef.current;
      if (pending) {
        // Quick release — fire shockwave
        pendingClickRef.current = null;
        if (ENABLE_SHOCKWAVE) {
          shockwavesRef.current.push({ x: pending.x, y: pending.y, time: performance.now() });
        }
      }

      // Release gravity well if active — fire shockwave from release point
      const grav = gravityRef.current;
      if (grav && grav.releaseTime === 0) {
        const now = performance.now();
        const diag = Math.sqrt(window.innerWidth ** 2 + window.innerHeight ** 2);
        const rampTime = ENABLE_VORTEX ? VORTEX_FULL_SCREEN_TIME : GRAVITY_FULL_SCREEN_TIME;
        const minR = ENABLE_VORTEX ? VORTEX_MIN_RADIUS : GRAVITY_MIN_RADIUS;
        const strength = Math.min(1, (now - grav.startTime) / rampTime);
        grav.holdStrength = strength;
        grav.holdRadius = minR + strength * (diag - minR);
        grav.releaseTime = now;
        // Fire shockwave on release
        if (ENABLE_SHOCKWAVE) {
          shockwavesRef.current.push({ x: grav.x, y: grav.y, time: now });
        }
      }
      scheduleFrame();
    }

    resize();
    scheduleFrame();

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      pendingRef.current = false;
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
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
