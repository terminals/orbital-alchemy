import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useOnboarding } from './OnboardingProvider';
import { useSettings } from '@/hooks/useSettings';

// ─── Geometry ───────────────────────────────────────────

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const POPOVER_GAP = 12;

function getTargetRect(el: HTMLElement, fontScale: number): Rect {
  const raw = el.getBoundingClientRect();
  // If the target is inside <main> (which has CSS zoom = fontScale),
  // getBoundingClientRect() returns zoomed coords but the body-mounted
  // portal is unzoomed. Divide by fontScale to compensate.
  const insideMain = !!el.closest('main');
  const scale = insideMain ? Math.max(fontScale, 0.1) : 1;
  return {
    top: raw.top / scale,
    left: raw.left / scale,
    width: raw.width / scale,
    height: raw.height / scale,
  };
}

function dotStyle(i: number, current: number): string {
  if (i === current) return 'w-4 bg-primary';
  if (i < current) return 'w-1.5 bg-primary/40';
  return 'w-1.5 bg-muted-foreground/20';
}

// ─── Component ──────────────────────────────────────────

export function SpotlightOverlay() {
  const { isActive, currentStep, currentStepIndex, totalSteps, targetElement, next, back, skip } = useOnboarding();
  const { settings } = useSettings();
  const [rect, setRect] = useState<Rect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const reduceMotion = settings.reduceMotion;
  const fontScale = settings.fontScale;

  // ─── Track target position ──────────────────────────

  const updateRect = useCallback(() => {
    if (!targetElement) {
      setRect(null);
      return;
    }
    setRect(getTargetRect(targetElement, fontScale));
  }, [targetElement, fontScale]);

  useEffect(() => {
    if (!targetElement) {
      setRect(null);
      return;
    }

    updateRect();

    // ResizeObserver to track target size changes
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateRect);
    });
    resizeObserver.observe(targetElement);

    // Also update on window resize/scroll
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [targetElement, updateRect]);

  // ─── Focus management ───────────────────────────────

  // Capture original focus when tour activates
  useEffect(() => {
    if (isActive) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
    }
  }, [isActive]);

  // Focus popover on each step change
  useEffect(() => {
    if (isActive && popoverRef.current) {
      popoverRef.current.focus();
    }
  }, [isActive, currentStepIndex]);

  // Restore focus when tour deactivates
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (isActive) {
      wasActiveRef.current = true;
    } else if (wasActiveRef.current) {
      wasActiveRef.current = false;
      if (prevFocusRef.current && document.body.contains(prevFocusRef.current)) {
        prevFocusRef.current.focus();
      }
      prevFocusRef.current = null;
    }
  }, [isActive]);

  // ─── Keyboard handling ──────────────────────────────

  useEffect(() => {
    if (!isActive) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        skip();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Tab') {
        // Trap focus within the popover
        if (!popoverRef.current) return;
        const focusable = popoverRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive, next, back, skip]);

  if (!isActive || !currentStep) return null;

  // ─── Popover positioning ────────────────────────────

  const placement = currentStep.placement ?? 'right';

  // Apply maxSpotlightWidth cap if configured
  const spotRect = rect && currentStep.maxSpotlightWidth && rect.width > currentStep.maxSpotlightWidth
    ? { ...rect, width: currentStep.maxSpotlightWidth }
    : rect;

  const popoverStyle = getPopoverStyle(spotRect, placement);

  // ─── Clip path for spotlight cutout ─────────────────

  const clipPath = spotRect
    ? `polygon(
        0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
        ${spotRect.left - PADDING}px ${spotRect.top - PADDING}px,
        ${spotRect.left + spotRect.width + PADDING}px ${spotRect.top - PADDING}px,
        ${spotRect.left + spotRect.width + PADDING}px ${spotRect.top + spotRect.height + PADDING}px,
        ${spotRect.left - PADDING}px ${spotRect.top + spotRect.height + PADDING}px,
        ${spotRect.left - PADDING}px ${spotRect.top - PADDING}px
      )`
    : undefined;

  const transitionStyle = reduceMotion ? 'none' : 'clip-path 0.3s ease-out';

  return createPortal(
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-step-title"
      aria-describedby="tour-step-desc"
    >
      {/* Backdrop with cutout */}
      <div
        className="absolute inset-0 dialog-overlay-glass"
        style={{
          clipPath,
          transition: transitionStyle,
        }}
        onClick={skip}
      />

      {/* Popover */}
      <div
        ref={popoverRef}
        tabIndex={-1}
        className="card-glass absolute rounded-xl p-5 shadow-lg outline-none"
        style={{
          ...popoverStyle,
          maxWidth: 360,
          minWidth: 280,
          transition: reduceMotion ? 'none' : 'top 0.3s ease-out, left 0.3s ease-out',
        }}
      >
        {/* Title */}
        <h3
          id="tour-step-title"
          className="text-sm font-medium text-foreground mb-1.5"
        >
          {currentStep.title}
        </h3>

        {/* Description */}
        <p
          id="tour-step-desc"
          className="text-xs text-muted-foreground/80 leading-relaxed mb-4"
        >
          {currentStep.description}
        </p>

        {/* Footer: progress + controls */}
        <div className="flex items-center justify-between">
          {/* Progress dots */}
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${dotStyle(i, currentStepIndex)}`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-2">
            {currentStepIndex > 0 && (
              <button
                onClick={back}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              >
                Back
              </button>
            )}
            <button
              onClick={skip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              Skip
            </button>
            <button
              onClick={next}
              className="text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md px-3 py-1 transition-colors"
            >
              {currentStepIndex === totalSteps - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>

        {/* Step counter */}
        <div className="mt-2 text-[10px] text-muted-foreground/50 text-right">
          {currentStepIndex + 1} / {totalSteps}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Positioning helper ───────────────────────────────

const POPOVER_HEIGHT_EST = 200;
const VIEWPORT_MARGIN = 16;

function getPopoverStyle(
  rect: Rect | null,
  placement: 'top' | 'bottom' | 'left' | 'right',
): React.CSSProperties {
  if (!rect) {
    // No target — center on screen
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  const POPOVER_WIDTH = 320; // between minWidth 280 and maxWidth 360

  // Clamp horizontal center so popover stays within viewport
  const clampLeft = (centerX: number) => {
    const half = POPOVER_WIDTH / 2;
    return Math.max(VIEWPORT_MARGIN + half, Math.min(window.innerWidth - VIEWPORT_MARGIN - half, centerX));
  };

  // Clamp vertical center so popover stays within viewport
  const clampTop = (centerY: number) =>
    Math.max(VIEWPORT_MARGIN + POPOVER_HEIGHT_EST / 2, Math.min(window.innerHeight - VIEWPORT_MARGIN - POPOVER_HEIGHT_EST / 2, centerY));

  // Auto-flip placement when the popover would overflow the viewport
  const spaceBelow = window.innerHeight - (rect.top + rect.height + PADDING + POPOVER_GAP);
  const spaceAbove = rect.top - PADDING - POPOVER_GAP;
  const spaceRight = window.innerWidth - (rect.left + rect.width + PADDING + POPOVER_GAP);
  const spaceLeft = rect.left - PADDING - POPOVER_GAP;
  let p = placement;
  if (p === 'bottom' && spaceBelow < POPOVER_HEIGHT_EST) {
    if (spaceAbove >= POPOVER_HEIGHT_EST) p = 'top';
    else if (spaceRight >= POPOVER_WIDTH) p = 'right';
    else if (spaceLeft >= POPOVER_WIDTH) p = 'left';
  } else if (p === 'top' && spaceAbove < POPOVER_HEIGHT_EST) {
    if (spaceBelow >= POPOVER_HEIGHT_EST) p = 'bottom';
    else if (spaceRight >= POPOVER_WIDTH) p = 'right';
    else if (spaceLeft >= POPOVER_WIDTH) p = 'left';
  }

  switch (p) {
    case 'top':
      return {
        bottom: window.innerHeight - rect.top + PADDING + POPOVER_GAP,
        left: clampLeft(rect.left + rect.width / 2),
        transform: 'translateX(-50%)',
      };
    case 'bottom':
      return {
        top: rect.top + rect.height + PADDING + POPOVER_GAP,
        left: clampLeft(rect.left + rect.width / 2),
        transform: 'translateX(-50%)',
      };
    case 'left':
      return {
        top: clampTop(rect.top + rect.height / 2),
        right: window.innerWidth - rect.left + PADDING + POPOVER_GAP,
        transform: 'translateY(-50%)',
      };
    case 'right':
      return {
        top: clampTop(rect.top + rect.height / 2),
        left: rect.left + rect.width + PADDING + POPOVER_GAP,
        transform: 'translateY(-50%)',
      };
  }
}
