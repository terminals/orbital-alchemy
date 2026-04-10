import { useRef, useEffect, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform, useInView, useSpring } from 'framer-motion';
import {
  LayoutDashboard,
  Zap,
  ShieldCheck,
  Workflow,
  Rocket,
  Terminal,
  GitBranch,
  ArrowRight,
  Clock,
  Cpu,
  Layers,
  Radio,
  ChevronDown,
  Sparkles,
  Eye,
  Bot,
  Command,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   ORBITAL COMMAND — LANDING PAGE
   Cinematic scroll experience with neon-glass aesthetic
   ═══════════════════════════════════════════════════════════════ */

// ---------------------------------------------------------------------------
// Animation primitives
// ---------------------------------------------------------------------------

const EASE_OUT: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

function FadeUp({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
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

function ScaleIn({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
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

function SlideIn({ children, delay = 0, direction = 'left', className = '' }: { children: ReactNode; delay?: number; direction?: 'left' | 'right'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
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

// ---------------------------------------------------------------------------
// Animated word reveal (hero headline)
// ---------------------------------------------------------------------------

function WordReveal({ text, className = '' }: { text: string; className?: string }) {
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, delay: 0.15 + i * 0.12, ease: EASE_OUT }}
          className="inline-block mr-[0.3em]"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Orbital ring animation (hero visual)
// ---------------------------------------------------------------------------

function OrbitalRings() {
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

// ---------------------------------------------------------------------------
// Floating particles
// ---------------------------------------------------------------------------

const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 1 + Math.random() * 2,
  duration: 15 + Math.random() * 25,
  delay: Math.random() * 10,
}));

function FloatingParticles() {
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

// ---------------------------------------------------------------------------
// Animated counter
// ---------------------------------------------------------------------------

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
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

// ---------------------------------------------------------------------------
// Terminal mockup with typing animation (safe React elements, no innerHTML)
// ---------------------------------------------------------------------------

type TermLine = { elements: ReactNode; delay: number };

const S = ({ color, children }: { color: string; children: ReactNode }) => (
  <span style={{ color }}>{children}</span>
);

const TERMINAL_LINES: TermLine[] = [
  { elements: <>$ orbital</>, delay: 400 },
  { elements: <>  Scaffolding hooks, skills, and agents...</>, delay: 800 },
  { elements: <>  Writing .claude/hooks/on-scope-change.sh</>, delay: 200 },
  { elements: <>  Writing .claude/hooks/on-quality-gate.sh</>, delay: 200 },
  { elements: <>  Creating orbital.config.json</>, delay: 300 },
  { elements: <>  <S color="#00e676">&#10003;</S> Orbital Command initialized</>, delay: 600 },
  { elements: <>&nbsp;</>, delay: 300 },
  { elements: <>  Launching dashboard...</>, delay: 500 },
  { elements: <>  Server running on http://localhost:4444</>, delay: 400 },
  { elements: <>  Client running on http://localhost:4445</>, delay: 200 },
  { elements: <>  <S color="#00bcd4">&#9673;</S> Watching scopes/ for changes...</>, delay: 300 },
  { elements: <>  <S color="#00bcd4">&#9673;</S> Watching .claude/orbital-events/ for events...</>, delay: 200 },
  { elements: <>  <S color="#00e676">&#10003;</S> Dashboard ready — mission control is live</>, delay: 0 },
];

function TerminalMockup() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let timeout: ReturnType<typeof setTimeout>;
    let i = 0;
    function showNext() {
      if (i >= TERMINAL_LINES.length) return;
      setVisibleCount(i + 1);
      i++;
      if (i < TERMINAL_LINES.length) {
        timeout = setTimeout(showNext, TERMINAL_LINES[i].delay);
      }
    }
    timeout = setTimeout(showNext, 600);
    return () => clearTimeout(timeout);
  }, [inView]);

  return (
    <div ref={ref} className="landing-terminal">
      <div className="landing-terminal-header">
        <div className="landing-terminal-dot landing-terminal-dot-red" />
        <div className="landing-terminal-dot landing-terminal-dot-yellow" />
        <div className="landing-terminal-dot landing-terminal-dot-green" />
        <span className="landing-terminal-title">orbital-command</span>
      </div>
      <div className="landing-terminal-body">
        {TERMINAL_LINES.slice(0, visibleCount).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="landing-terminal-line"
          >
            {line.elements}
          </motion.div>
        ))}
        <motion.span
          className="landing-terminal-cursor"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          &#9612;
        </motion.span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glowing feature card
// ---------------------------------------------------------------------------

const COLOR_MAP = {
  cyan:   { glow: 'rgba(0,188,212,0.15)', border: 'rgba(0,188,212,0.3)', text: '#00bcd4' },
  pink:   { glow: 'rgba(233,30,99,0.15)', border: 'rgba(233,30,99,0.3)', text: '#e91e63' },
  green:  { glow: 'rgba(0,230,118,0.15)', border: 'rgba(0,230,118,0.3)', text: '#00e676' },
  amber:  { glow: 'rgba(255,171,0,0.15)', border: 'rgba(255,171,0,0.3)', text: '#ffab00' },
  purple: { glow: 'rgba(117,109,158,0.2)', border: 'rgba(117,109,158,0.4)', text: '#9c8fd4' },
} as const;

function FeatureCard({ icon: Icon, title, description, color, delay = 0 }: {
  icon: typeof LayoutDashboard;
  title: string;
  description: string;
  color: keyof typeof COLOR_MAP;
  delay?: number;
}) {
  const c = COLOR_MAP[color];
  return (
    <FadeUp delay={delay}>
      <motion.div
        className="landing-feature-card group"
        whileHover={{ y: -8, transition: { duration: 0.3 } }}
      >
        <div
          className="landing-feature-icon-wrap"
          style={{ background: c.glow, borderColor: c.border }}
        >
          <Icon size={24} style={{ color: c.text }} />
        </div>
        <h3 className="landing-feature-title">{title}</h3>
        <p className="landing-feature-desc">{description}</p>
        <div
          className="landing-feature-glow"
          style={{ background: `radial-gradient(ellipse at center, ${c.glow}, transparent 70%)` }}
        />
      </motion.div>
    </FadeUp>
  );
}

// ---------------------------------------------------------------------------
// Parallax showcase cards
// ---------------------------------------------------------------------------

const SHOWCASE_ITEMS = [
  { label: 'Kanban Board', gradient: 'from-cyan-500/20 to-blue-500/20', icon: LayoutDashboard },
  { label: 'Quality Gates', gradient: 'from-green-500/20 to-emerald-500/20', icon: ShieldCheck },
  { label: 'Workflow DAG', gradient: 'from-purple-500/20 to-pink-500/20', icon: Workflow },
  { label: 'Agent Feed', gradient: 'from-pink-500/20 to-red-500/20', icon: Bot },
  { label: 'Sprint View', gradient: 'from-amber-500/20 to-orange-500/20', icon: Zap },
  { label: 'Deploy Pipeline', gradient: 'from-cyan-500/20 to-teal-500/20', icon: Rocket },
];

function ShowcaseSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  const x = useTransform(scrollYProgress, [0, 1], ['5%', '-15%']);

  return (
    <div ref={containerRef} className="overflow-hidden py-8">
      <motion.div className="flex gap-6 px-8" style={{ x }}>
        {SHOWCASE_ITEMS.map((item) => (
          <motion.div
            key={item.label}
            className={`landing-showcase-card bg-gradient-to-br ${item.gradient}`}
            whileHover={{ scale: 1.03 }}
            transition={{ duration: 0.3 }}
          >
            <item.icon size={48} className="text-white/30 mb-4" />
            <span className="text-lg font-medium text-white/80">{item.label}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scroll progress indicator
// ---------------------------------------------------------------------------

function ScrollProgress() {
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

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------

function Navbar() {
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
            <Command size={20} className="text-[#00bcd4]" />
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
            <GitBranch size={14} />
            GitHub
          </a>
        </div>
      </div>
    </motion.nav>
  );
}

// ---------------------------------------------------------------------------
// How it works step
// ---------------------------------------------------------------------------

function HowItWorksStep({ number, title, description, icon: Icon, delay }: {
  number: string;
  title: string;
  description: string;
  icon: typeof Terminal;
  delay: number;
}) {
  return (
    <FadeUp delay={delay} className="landing-step">
      <div className="landing-step-number">{number}</div>
      <div className="landing-step-icon">
        <Icon size={28} />
      </div>
      <h3 className="text-lg font-semibold text-white mt-4 mb-2">{title}</h3>
      <p className="text-sm text-white/50 leading-relaxed">{description}</p>
    </FadeUp>
  );
}

// ---------------------------------------------------------------------------
// Architecture diagram
// ---------------------------------------------------------------------------

const ARCH_LAYERS = [
  { label: 'Frontend', sub: 'React + Vite + Tailwind', color: '#00bcd4', icon: Eye },
  { label: 'Real-time', sub: 'Socket.io Push', color: '#e91e63', icon: Radio },
  { label: 'API', sub: 'Express REST', color: '#ffab00', icon: Layers },
  { label: 'Engine', sub: 'Workflow + Events', color: '#00e676', icon: Cpu },
];

function ArchitectureDiagram() {
  return (
    <div className="landing-arch-stack">
      {ARCH_LAYERS.map((layer) => (
        <motion.div
          key={layer.label}
          className="landing-arch-layer"
          whileHover={{ x: 8, transition: { duration: 0.2 } }}
          style={{ borderLeftColor: layer.color }}
        >
          <div className="landing-arch-icon" style={{ color: layer.color }}>
            <layer.icon size={20} />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{layer.label}</div>
            <div className="text-xs text-white/40">{layer.sub}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Landing component
// ---------------------------------------------------------------------------

export function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroY = useTransform(heroScroll, [0, 1], [0, 200]);
  const heroOpacity = useTransform(heroScroll, [0, 0.6], [1, 0]);
  const ringsY = useTransform(heroScroll, [0, 1], [0, 100]);

  return (
    <div className="landing-root">
      <ScrollProgress />
      <Navbar />
      <FloatingParticles />

      {/* ════════════════ HERO ════════════════ */}
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
            <code>npm install -g orbital-command && orbital</code>
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

      {/* ════════════════ STATS BAR ════════════════ */}
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

      {/* ════════════════ FEATURES ════════════════ */}
      <section id="features" className="landing-section">
        <div className="landing-section-inner">
          <FadeUp><p className="landing-section-tag">Features</p></FadeUp>
          <FadeUp delay={0.1}>
            <h2 className="landing-section-title">
              Everything you need to<br />
              <span className="landing-gradient-text">orchestrate AI agents.</span>
            </h2>
          </FadeUp>
          <FadeUp delay={0.2}>
            <p className="landing-section-desc">
              A complete mission control system that turns Claude Code sessions into
              observable, manageable workflows with real-time feedback.
            </p>
          </FadeUp>

          <div className="landing-features-grid">
            <FeatureCard icon={LayoutDashboard} title="Visual Kanban" description="Drag-and-drop scope cards across workflow columns. Real-time status updates as Claude agents work through tasks." color="cyan" delay={0} />
            <FeatureCard icon={Zap} title="Sprint Orchestration" description="Batch scopes into sprints with automatic sequencing, dependency resolution, and parallel execution across agents." color="pink" delay={0.08} />
            <FeatureCard icon={ShieldCheck} title="Quality Gates" description="Enforce standards with configurable gates — typecheck, lint, test, build. Auto-block deployments that fail checks." color="green" delay={0.16} />
            <FeatureCard icon={Workflow} title="Workflow DAG Editor" description="Visual directed acyclic graph editor for custom workflows. Define columns, transitions, hooks, and inference rules." color="purple" delay={0.08} />
            <FeatureCard icon={Bot} title="Agent Feed" description="Live stream of all Claude Code events across every session. Filter by agent, scope, or event type. Full audit trail." color="amber" delay={0.16} />
            <FeatureCard icon={Rocket} title="Deploy Pipeline" description="Multi-stage deployment visualization from dev to staging to production. Rollback controls and promotion gates." color="cyan" delay={0.24} />
          </div>
        </div>
      </section>

      {/* ════════════════ SHOWCASE SCROLL ════════════════ */}
      <section className="landing-section-full">
        <FadeUp className="text-center mb-12">
          <p className="landing-section-tag">Dashboard</p>
          <h2 className="landing-section-title">
            Six views. <span className="landing-gradient-text">One command center.</span>
          </h2>
        </FadeUp>
        <ShowcaseSection />
      </section>

      {/* ════════════════ HOW IT WORKS ════════════════ */}
      <section id="how-it-works" className="landing-section">
        <div className="landing-section-inner">
          <FadeUp><p className="landing-section-tag">How It Works</p></FadeUp>
          <FadeUp delay={0.1}>
            <h2 className="landing-section-title">
              Three steps to<br />
              <span className="landing-gradient-text">mission control.</span>
            </h2>
          </FadeUp>

          <div className="landing-steps-grid">
            <HowItWorksStep number="01" title="Initialize" description="Run orbital in your project. The setup wizard scaffolds hooks, skills, agents, and config into your .claude/ directory. Zero lock-in — everything is plain files." icon={Terminal} delay={0} />
            <HowItWorksStep number="02" title="Define Scopes" description="Write markdown files with YAML frontmatter in scopes/. Each scope is a task card — title, status, category, priority, assignee. Claude reads and updates them." icon={GitBranch} delay={0.15} />
            <HowItWorksStep number="03" title="Launch" description="Select Launch from the hub menu and open the dashboard. Watch your AI fleet in real-time as Claude agents pick up scopes, emit events, and progress through your workflow." icon={Rocket} delay={0.3} />
          </div>
        </div>
      </section>

      {/* ════════════════ TERMINAL DEMO ════════════════ */}
      <section className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-split">
            <SlideIn direction="left" className="flex-1 min-w-0">
              <p className="landing-section-tag">Developer Experience</p>
              <h2 className="landing-section-title text-left">
                Get running in<br />
                <span className="landing-gradient-text">under a minute.</span>
              </h2>
              <p className="landing-section-desc text-left mt-4">
                One command to scaffold. One command to launch. File-based architecture
                means everything is inspectable, versionable, and customizable.
              </p>
              <div className="landing-dx-features">
                <div className="landing-dx-item"><Clock size={16} className="text-[#00bcd4]" /><span>Zero-config setup</span></div>
                <div className="landing-dx-item"><Layers size={16} className="text-[#e91e63]" /><span>File-based event bus</span></div>
                <div className="landing-dx-item"><Radio size={16} className="text-[#00e676]" /><span>Real-time Socket.io sync</span></div>
                <div className="landing-dx-item"><Cpu size={16} className="text-[#ffab00]" /><span>SQLite persistence</span></div>
              </div>
            </SlideIn>
            <SlideIn direction="right" className="flex-1 min-w-0">
              <TerminalMockup />
            </SlideIn>
          </div>
        </div>
      </section>

      {/* ════════════════ ARCHITECTURE ════════════════ */}
      <section id="architecture" className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-split">
            <SlideIn direction="left" className="flex-1 min-w-0">
              <p className="landing-section-tag">Architecture</p>
              <h2 className="landing-section-title text-left">
                Built on<br />
                <span className="landing-gradient-text">open primitives.</span>
              </h2>
              <p className="landing-section-desc text-left mt-4">
                Markdown files are tasks. JSON files are events. The workflow engine
                is pure TypeScript with zero I/O. Everything is observable and hackable.
              </p>
            </SlideIn>
            <SlideIn direction="right" className="flex-1 min-w-0">
              <ArchitectureDiagram />
            </SlideIn>
          </div>
        </div>
      </section>

      {/* ════════════════ FINAL CTA ════════════════ */}
      <section className="landing-final-cta">
        <div className="landing-final-cta-bg" />
        <div className="relative z-10 max-w-3xl mx-auto text-center px-6">
          <ScaleIn>
            <h2 className="landing-final-headline">
              Ready for<br />
              <span className="landing-gradient-text">liftoff?</span>
            </h2>
          </ScaleIn>
          <FadeUp delay={0.2}>
            <p className="text-lg text-white/50 mb-10 leading-relaxed">
              Install Orbital Command and take control of your AI-powered development workflow.
              Open source. Zero lock-in. Fully extensible.
            </p>
          </FadeUp>
          <FadeUp delay={0.4}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://github.com/SakaraLabs/orbital-command"
                target="_blank"
                rel="noopener noreferrer"
                className="landing-cta-primary group text-base px-8 py-4"
              >
                <GitBranch size={18} />
                View on GitHub
                <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
              </a>
              <div className="landing-install">
                <code>npm install orbital-command</code>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ════════════════ FOOTER ════════════════ */}
      <footer className="landing-footer">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Command size={16} className="text-[#00bcd4]" />
            <span className="text-sm text-white/40">Orbital Command</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://github.com/SakaraLabs/orbital-command" target="_blank" rel="noopener noreferrer" className="text-xs text-white/30 hover:text-white/60 transition-colors">GitHub</a>
            <span className="text-xs text-white/20">MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
