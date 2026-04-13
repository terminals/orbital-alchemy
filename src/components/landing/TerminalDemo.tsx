import { useRef, useEffect, useState, type ReactNode } from 'react';
import { motion, useInView } from 'framer-motion';

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

export function TerminalMockup() {
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
