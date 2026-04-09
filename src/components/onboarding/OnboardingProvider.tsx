import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { TOUR_STEPS, type TourStep } from './tour-steps';

// ─── Types ──────────────────────────────────────────────

type OnboardingStatus = 'pending' | 'completed' | 'dismissed';

interface OnboardingContextValue {
  /** Whether the tour is currently active */
  isActive: boolean;
  /** Current step index (-1 when inactive) */
  currentStepIndex: number;
  /** Current step config, or null when inactive */
  currentStep: TourStep | null;
  /** Total number of steps */
  totalSteps: number;
  /** The target DOM element for the current step, or null */
  targetElement: HTMLElement | null;
  /** Advance to the next step */
  next: () => void;
  /** Go back to the previous step */
  back: () => void;
  /** Skip/close the tour */
  skip: () => void;
  /** Restart the tour from the beginning */
  restart: () => void;
  /** Start the tour (for first-visit auto-trigger) */
  start: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const INACTIVE_CONTEXT: OnboardingContextValue = {
  isActive: false,
  currentStepIndex: -1,
  currentStep: null,
  totalSteps: 0,
  targetElement: null,
  next: () => {},
  back: () => {},
  skip: () => {},
  restart: () => {},
  start: () => {},
};

export function useOnboarding(): OnboardingContextValue {
  return useContext(OnboardingContext) ?? INACTIVE_CONTEXT;
}

// ─── Provider ───────────────────────────────────────────

const STORAGE_KEY = 'cc-onboarding-tour';
// 5s gives lazy-loaded pages time to mount; increase if slow connections cause skipped steps
const TARGET_WAIT_TIMEOUT = 5000;

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useLocalStorage<OnboardingStatus>(STORAGE_KEY, 'pending');
  const [stepIndex, setStepIndex] = useState(-1);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const observerRef = useRef<MutationObserver | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitioningRef = useRef(false);
  const isActive = stepIndex >= 0 && stepIndex < TOUR_STEPS.length;

  // Cleanup MutationObserver and timeout
  const cleanupWatcher = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Find target element by data-tour attribute
  const findTarget = useCallback((targetId: string): HTMLElement | null => {
    return document.querySelector(`[data-tour="${targetId}"]`);
  }, []);

  // Wait for a target to appear in the DOM via MutationObserver
  const waitForTarget = useCallback((step: TourStep, onFound: (el: HTMLElement) => void, onTimeout: () => void) => {
    cleanupWatcher();

    // Try immediately first
    const el = findTarget(step.target);
    if (el) {
      onFound(el);
      return;
    }

    // Watch for DOM changes
    observerRef.current = new MutationObserver(() => {
      const found = findTarget(step.target);
      if (found) {
        cleanupWatcher();
        onFound(found);
      }
    });
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tour'],
    });

    // Timeout — skip gracefully
    timeoutRef.current = setTimeout(() => {
      cleanupWatcher();
      onTimeout();
    }, TARGET_WAIT_TIMEOUT);
  }, [cleanupWatcher, findTarget]);

  // Resolve a step: navigate if needed, find target, handle optional skips
  const resolveStep = useCallback((index: number) => {
    if (transitioningRef.current) return;
    if (index < 0 || index >= TOUR_STEPS.length) {
      setStepIndex(-1);
      setTargetElement(null);
      cleanupWatcher();
      return;
    }

    transitioningRef.current = true;
    const step = TOUR_STEPS[index];

    // Navigate to the step's page if we're not already there
    const currentPath = locationRef.current.pathname;
    if (step.page && step.page !== currentPath) {
      navigate(step.page + locationRef.current.search);
    }

    // Wait for target to appear (handles lazy-loaded pages)
    waitForTarget(
      step,
      (el) => {
        transitioningRef.current = false;
        setStepIndex(index);
        setTargetElement(el);
      },
      () => {
        transitioningRef.current = false;
        // Target not found — skip to next if optional, otherwise show step without spotlight to avoid getting stuck
        if (step.optional) {
          // Skip to next step
          resolveStep(index + 1);
        } else {
          console.warn(`[Onboarding] Target "${step.target}" not found after ${TARGET_WAIT_TIMEOUT}ms on step "${step.id}"`);
          // Non-optional target missing — still advance to avoid stuck state
          setStepIndex(index);
          setTargetElement(null);
        }
      },
    );
  }, [navigate, waitForTarget, cleanupWatcher]);

  // ─── Navigation ───────────────────────────────────────

  const next = useCallback(() => {
    const nextIndex = stepIndex + 1;
    if (nextIndex >= TOUR_STEPS.length) {
      // Tour complete — navigate back to the Kanban board
      setState('completed');
      setStepIndex(-1);
      setTargetElement(null);
      cleanupWatcher();
      if (locationRef.current.pathname !== '/') {
        navigate('/' + locationRef.current.search);
      }
    } else {
      resolveStep(nextIndex);
    }
  }, [stepIndex, setState, resolveStep, cleanupWatcher]);

  const back = useCallback(() => {
    if (stepIndex > 0) {
      resolveStep(stepIndex - 1);
    }
  }, [stepIndex, resolveStep]);

  const skip = useCallback(() => {
    setState('dismissed');
    setStepIndex(-1);
    setTargetElement(null);
    cleanupWatcher();
  }, [setState, cleanupWatcher]);

  const restart = useCallback(() => {
    setState('pending');
    resolveStep(0);
  }, [setState, resolveStep]);

  const start = useCallback(() => {
    if (!isActive) {
      resolveStep(0);
    }
  }, [isActive, resolveStep]);

  // ─── Target disappearance detection ───────────────────

  useEffect(() => {
    if (!isActive || !targetElement) return;

    const observer = new MutationObserver(() => {
      if (!document.body.contains(targetElement)) {
        // Target removed from DOM — advance to next step
        setTargetElement(null);
        next();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isActive, targetElement, next]);

  // ─── Cross-tab sync ───────────────────────────────────
  // useLocalStorage already handles StorageEvent for the state value.
  // We just need to dismiss the active tour if another tab completes it.
  useEffect(() => {
    if (state !== 'pending') {
      if (isActive) {
        setStepIndex(-1);
        setTargetElement(null);
        cleanupWatcher();
      }
    }
  }, [state, isActive, cleanupWatcher]);

  // ─── Auto-trigger on first visit ────────────────────────

  const hasAutoTriggered = useRef(false);
  useEffect(() => {
    if (hasAutoTriggered.current) return;
    if (state === 'pending' && !isActive) {
      // Small delay to let the page render before starting the tour
      const timer = setTimeout(() => {
        if (!hasAutoTriggered.current) {
          hasAutoTriggered.current = true;
          resolveStep(0);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state, isActive, resolveStep]);

  // ─── Cleanup on unmount ───────────────────────────────

  useEffect(() => {
    return () => cleanupWatcher();
  }, [cleanupWatcher]);

  const currentStep = isActive ? TOUR_STEPS[stepIndex] : null;

  const value: OnboardingContextValue = {
    isActive,
    currentStepIndex: stepIndex,
    currentStep,
    totalSteps: TOUR_STEPS.length,
    targetElement,
    next,
    back,
    skip,
    restart,
    start,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}
