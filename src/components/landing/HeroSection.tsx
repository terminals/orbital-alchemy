import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Terminal,
  ArrowRight,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { EASE_OUT, WordReveal, OrbitalRings, AnimatedCounter } from './animations';

export function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroY = useTransform(heroScroll, [0, 1], [0, 200]);
  const heroOpacity = useTransform(heroScroll, [0, 0.6], [1, 0]);
  const ringsY = useTransform(heroScroll, [0, 1], [0, 100]);

  return (
    <>
      <section ref={heroRef} className="landing-hero">
        <div className="landing-hero-orb landing-hero-orb-1" />
        <div className="landing-hero-orb landing-hero-orb-2" />
        <div className="landing-hero-orb landing-hero-orb-3" />

        <motion.div className="landing-hero-content" style={{ y: heroY, opacity: heroOpacity }}>
          <motion.div
            className="landing-badge"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Sparkles size={14} className="text-[#00bcd4]" />
            <span>Mission control for Claude Code</span>
          </motion.div>

          <h1 className="landing-headline">
            <WordReveal text="Command your" />
            <br />
            <motion.span
              className="landing-headline-gradient"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5, ease: EASE_OUT }}
            >
              AI fleet.
            </motion.span>
          </h1>

          <motion.p
            className="landing-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.8 }}
          >
            Real-time project management dashboard for Claude Code.
            <br className="hidden sm:block" />
            Kanban boards, sprint orchestration, quality gates, and deploy pipelines
            <br className="hidden sm:block" />
            — all driven by a file-based event bus.
          </motion.p>

          <motion.div
            className="landing-cta-row"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.0 }}
          >
            <a
              href="https://github.com/SakaraLabs/orbital-command"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-cta-primary group"
            >
              <Terminal size={18} />
              Get Started
              <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
            </a>
            <a href="#features" className="landing-cta-secondary">
              See Features
              <ChevronDown size={16} />
            </a>
          </motion.div>

          <motion.div
            className="landing-install"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.3 }}
          >
            <code>npm install -g orbital-command</code>
          </motion.div>
        </motion.div>

        <motion.div
          className="landing-hero-visual"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.5, ease: EASE_OUT }}
          style={{ y: ringsY }}
        >
          <OrbitalRings />
        </motion.div>

        <motion.div
          className="landing-scroll-indicator"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown size={20} className="text-white/30" />
        </motion.div>
      </section>

      {/* Stats bar */}
      <section className="landing-stats">
        <div className="landing-stats-inner">
          {[
            { value: 7, suffix: '', label: 'Dashboard Views' },
            { value: 100, suffix: '%', label: 'File-Based' },
            { value: 0, suffix: '', label: 'Lock-in', staticText: '0' },
            { label: 'Real-time Sync', staticText: 'RT' },
          ].map((s, i) => (
            <div key={s.label} className="contents">
              {i > 0 && <div className="landing-stat-divider" />}
              <div className="landing-stat">
                <span className="landing-stat-value">
                  {s.staticText ?? <AnimatedCounter value={s.value!} suffix={s.suffix} />}
                </span>
                <span className="landing-stat-label">{s.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
