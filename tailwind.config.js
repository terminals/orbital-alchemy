import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontSize: {
        'xxs': ['11px', { lineHeight: '15px' }],
        'xs':  ['12px', { lineHeight: '17px' }],
        'sm':  ['13px', { lineHeight: '19px' }],
        'base': ['14px', { lineHeight: '20px' }],
        'lg':  ['16px', { lineHeight: '22px' }],
        'xl':  ['18px', { lineHeight: '24px' }],
        '2xl': ['20px', { lineHeight: '26px' }],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Hunter surface tokens
        'surface': '#12121a',
        'surface-light': '#1a1a28',
        // Hunter accent tokens
        'bid-green': '#00c853',
        'ask-red': '#ff1744',
        'accent-blue': '#06b6d4',
        'warning-amber': '#ffab00',
        'info-cyan': '#40c4ff',
        // Status colors — mapped to CSS variables defined in index.css.
        // Custom workflows adding new statuses must add corresponding entries here
        // and define matching --status-<name> CSS variables in index.css.
        'status': {
          'icebox': 'hsl(var(--status-icebox))',
          'planning': 'hsl(var(--status-planning))',
          'backlog': 'hsl(var(--status-backlog))',
          'implementing': 'hsl(var(--status-implementing))',
          'review': 'hsl(var(--status-review))',
          'completed': 'hsl(var(--status-completed))',
          'dev': 'hsl(var(--status-dev))',
          'staging': 'hsl(var(--status-staging))',
          'production': 'hsl(var(--status-production))',
        },
        // Category and agent colors — injected as CSS variables from orbital.config.json
        // Use var(--category-<name>) and var(--agent-<name>) in components
        'category': {
          'feature':        'var(--category-feature, #536dfe)',
          'bugfix':         'var(--category-bugfix, #ff1744)',
          'refactor':       'var(--category-refactor, #8B5CF6)',
          'infrastructure': 'var(--category-infrastructure, #40c4ff)',
          'docs':           'var(--category-docs, #6B7280)',
        },
        'agent': {
          'attacker':  'var(--agent-attacker, #ff1744)',
          'chaos':     'var(--agent-chaos, #F97316)',
          'frontend':  'var(--agent-frontend, #EC4899)',
          'architect': 'var(--agent-architect, #536dfe)',
          'devops':    'var(--agent-devops, #40c4ff)',
          'rules':     'var(--agent-rules, #6B7280)',
        },
      },
      borderRadius: {
        lg: '0.375rem',
        md: '0.25rem',
        sm: '0.125rem',
      },
      fontFamily: {
        sans: ['var(--font-family)', 'monospace'],
        mono: ['var(--font-family)', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-right': 'slideRight 0.3s ease-out',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        'pulse-border': 'pulseBorder 2s ease-in-out infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'breathe': 'breathe 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideRight: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        pulseBorder: {
          '0%, 100%': { borderColor: 'rgba(0, 188, 212, 0.3)' },
          '50%': { borderColor: 'rgba(0, 188, 212, 0.8)' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(0,188,212,0.25)' },
          '50%': { boxShadow: '0 0 18px rgba(0,188,212,0.5)' },
        },
        breathe: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.02)' },
        },
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
