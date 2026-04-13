import { useRef, useEffect, useState, Fragment, type ReactNode, type RefObject } from 'react';
import { motion, useInView, useScroll, useSpring } from 'framer-motion';

export const EASE_OUT: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

// Wraps framer-motion's useInView with a safety timer fallback. At narrow viewports,
// wide elements may never reach the observer's visibility threshold (F-009), leaving
// content stuck at opacity 0. The timer forces visibility after 1.5s regardless.
function useInViewWithFallback(ref: RefObject<HTMLElement | null>, fallbackMs = 1500): boolean {
  const inViewNative = useInView(ref, { once: true, amount: 'some' });
  const [forceVisible, setForceVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setForceVisible(true), fallbackMs);
    return () => clearTimeout(t);
  }, [fallbackMs]);
  return inViewNative || forceVisible;
}

export function FadeUp({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInViewWithFallback(ref);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 48 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function ScaleIn({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInViewWithFallback(ref);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.7, delay, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SlideIn({ children, delay = 0, direction = 'left', className = '' }: { children: ReactNode; delay?: number; direction?: 'left' | 'right'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInViewWithFallback(ref);
  const x = direction === 'left' ? -80 : 80;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function WordReveal({ text, className = '' }: { text: string; className?: string }) {
  const words = text.split(' ');
  // Each word wraps in its own motion.span, with a literal text-node space between
  // spans so textContent reads naturally ("Command your" not "Commandyour") for
  // screen readers and copy/paste. The trailing space on the last word is harmless
  // and keeps the logic simple.
  return (
    <span className={className}>
      {words.map((word, i) => (
        <Fragment key={i}>
          <motion.span
            initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, delay: 0.15 + i * 0.12, ease: EASE_OUT }}
            className="inline-block"
          >
            {word}
          </motion.span>
          {' '}
        </Fragment>
      ))}
    </span>
  );
}

export function OrbitalRings() {
  return (
    <div className="landing-orbital-rings">
      <motion.div
        className="landing-ring landing-ring-1"
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      >
        <div className="landing-ring-dot" style={{ top: '0%', left: '50%' }} />
        <div className="landing-ring-dot" style={{ bottom: '0%', left: '50%' }} />
      </motion.div>
      <motion.div
        className="landing-ring landing-ring-2"
        animate={{ rotate: -360 }}
        transition={{ duration: 45, repeat: Infinity, ease: 'linear' }}
      >
        <div className="landing-ring-dot landing-ring-dot-pink" style={{ top: '50%', right: '0%' }} />
      </motion.div>
      <motion.div
        className="landing-ring landing-ring-3"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      >
        <div className="landing-ring-dot landing-ring-dot-green" style={{ top: '10%', left: '15%' }} />
        <div className="landing-ring-dot" style={{ bottom: '15%', right: '10%' }} />
      </motion.div>
      <div className="landing-center-glow" />
    </div>
  );
}

const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 1 + Math.random() * 2,
  duration: 15 + Math.random() * 25,
  delay: Math.random() * 10,
}));

export function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {PARTICLES.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.id % 3 === 0
              ? 'rgba(0, 188, 212, 0.5)'
              : p.id % 3 === 1
                ? 'rgba(233, 30, 99, 0.4)'
                : 'rgba(255, 255, 255, 0.2)',
          }}
          animate={{
            y: [-20, 20, -20],
            x: [-10, 10, -10],
            opacity: [0.2, 0.7, 0.2],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) return;
    // Delay start to sync with scroll into view
    const timeout = setTimeout(() => {
      const duration = 1500;
      const start = performance.now();
      function tick(now: number) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(eased * value));
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, 800);
    return () => clearTimeout(timeout);
  }, [value]);

  return <span>{display}{suffix}</span>;
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-[2px] z-50 origin-left"
      style={{
        scaleX,
        background: 'linear-gradient(90deg, #00bcd4, #e91e63, #00bcd4)',
      }}
    />
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${
        scrolled ? 'landing-nav-scrolled' : 'landing-nav-transparent'
      }`}
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="landing-nav-logo">
            <CommandIcon size={20} className="text-[#00bcd4]" />
          </div>
          <span className="text-base font-semibold tracking-tight text-white">
            Orbital Command
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-white/60 hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="text-sm text-white/60 hover:text-white transition-colors">How It Works</a>
          <a href="#architecture" className="text-sm text-white/60 hover:text-white transition-colors">Architecture</a>
          <a
            href="https://github.com/SakaraLabs/orbital-command"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-nav-cta"
          >
            <GitBranchIcon size={14} />
            GitHub
          </a>
        </div>
      </div>
    </motion.nav>
  );
}

// Re-export icons used by Navbar to avoid leaking lucide imports
import { Command as CommandIcon, GitBranch as GitBranchIcon } from 'lucide-react';
