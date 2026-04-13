import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Zap,
  ShieldCheck,
  Workflow,
  Rocket,
  Bot,
} from 'lucide-react';
import { FadeUp } from './animations';

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

export function FeaturesSection() {
  return (
    <section id="features" className="landing-section">
      <div className="landing-section-inner">
        <FadeUp><p className="landing-section-tag">Features</p></FadeUp>
        <FadeUp delay={0.1}>
          <h2 className="landing-section-title">
            Everything you need to<br />
            {' '}<span className="landing-gradient-text">orchestrate AI agents.</span>
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
  );
}
