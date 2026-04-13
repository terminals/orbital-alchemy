import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  LayoutDashboard,
  ShieldCheck,
  Workflow,
  Rocket,
  Zap,
  Bot,
} from 'lucide-react';
import { FadeUp } from './animations';

const SHOWCASE_ITEMS = [
  { label: 'Kanban Board', gradient: 'from-cyan-500/20 to-blue-500/20', icon: LayoutDashboard },
  { label: 'Quality Gates', gradient: 'from-green-500/20 to-emerald-500/20', icon: ShieldCheck },
  { label: 'Workflow DAG', gradient: 'from-purple-500/20 to-pink-500/20', icon: Workflow },
  { label: 'Agent Feed', gradient: 'from-pink-500/20 to-red-500/20', icon: Bot },
  { label: 'Sprint View', gradient: 'from-amber-500/20 to-orange-500/20', icon: Zap },
  { label: 'Deploy Pipeline', gradient: 'from-cyan-500/20 to-teal-500/20', icon: Rocket },
];

export function ShowcaseSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  const x = useTransform(scrollYProgress, [0, 1], ['5%', '-15%']);

  return (
    <section className="landing-section-full">
      <FadeUp className="text-center mb-12">
        <p className="landing-section-tag">Dashboard</p>
        <h2 className="landing-section-title">
          Six views. <span className="landing-gradient-text">One command center.</span>
        </h2>
      </FadeUp>
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
    </section>
  );
}
