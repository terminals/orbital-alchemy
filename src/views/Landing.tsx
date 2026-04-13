import { motion } from 'framer-motion';
import {
  Terminal,
  GitBranch,
  ArrowRight,
  Clock,
  Cpu,
  Layers,
  Radio,
  Rocket,
  Eye,
  Command,
} from 'lucide-react';
import {
  FadeUp,
  ScaleIn,
  SlideIn,
  ScrollProgress,
  Navbar,
  FloatingParticles,
} from '@/components/landing/animations';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { TerminalMockup } from '@/components/landing/TerminalDemo';
import { ShowcaseSection } from '@/components/landing/ShowcaseSection';

// ---------------------------------------------------------------------------
// How it works step (small, single-use — kept inline)
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
// Architecture diagram (small, single-use — kept inline)
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
  return (
    <div className="landing-root">
      <ScrollProgress />
      <Navbar />
      <FloatingParticles />

      {/* Hero + Stats */}
      <HeroSection />

      {/* Features */}
      <FeaturesSection />

      {/* Showcase Scroll */}
      <ShowcaseSection />

      {/* How It Works */}
      <section id="how-it-works" className="landing-section">
        <div className="landing-section-inner">
          <FadeUp><p className="landing-section-tag">How It Works</p></FadeUp>
          <FadeUp delay={0.1}>
            <h2 className="landing-section-title">
              Three steps to<br />
              {' '}<span className="landing-gradient-text">mission control.</span>
            </h2>
          </FadeUp>

          <div className="landing-steps-grid">
            <HowItWorksStep number="01" title="Initialize" description="Run orbital in your project. The setup wizard scaffolds hooks, skills, agents, and config into your .claude/ directory. Zero lock-in — everything is plain files." icon={Terminal} delay={0} />
            <HowItWorksStep number="02" title="Define Scopes" description="Write markdown files with YAML frontmatter in scopes/. Each scope is a task card — title, status, category, priority, assignee. Claude reads and updates them." icon={GitBranch} delay={0.15} />
            <HowItWorksStep number="03" title="Launch" description="Select Launch from the hub menu and open the dashboard. Watch your AI fleet in real-time as Claude agents pick up scopes, emit events, and progress through your workflow." icon={Rocket} delay={0.3} />
          </div>
        </div>
      </section>

      {/* Terminal Demo */}
      <section className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-split">
            <SlideIn direction="left" className="flex-1 min-w-0">
              <p className="landing-section-tag">Developer Experience</p>
              <h2 className="landing-section-title text-left">
                Get running in<br />
                {' '}<span className="landing-gradient-text">under a minute.</span>
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

      {/* Architecture */}
      <section id="architecture" className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-split">
            <SlideIn direction="left" className="flex-1 min-w-0">
              <p className="landing-section-tag">Architecture</p>
              <h2 className="landing-section-title text-left">
                Built on<br />
                {' '}<span className="landing-gradient-text">open primitives.</span>
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

      {/* Final CTA */}
      <section className="landing-final-cta">
        <div className="landing-final-cta-bg" />
        <div className="relative z-10 max-w-3xl mx-auto text-center px-6">
          <ScaleIn>
            <h2 className="landing-final-headline">
              Ready for<br />
              {' '}<span className="landing-gradient-text">liftoff?</span>
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

      {/* Footer */}
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
