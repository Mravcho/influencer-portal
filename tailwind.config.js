/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  // Preflight is OFF — нашите съществуващи .js страници имат свой reset
  // в globals.css. Tailwind utilities работят без preflight.
  corePlugins: { preflight: false },
  content: ['./app/**/*.{js,jsx,ts,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Geist', 'SF Pro Display', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.3), 0 8px 24px -8px rgba(0,0,0,.5)',
        hero: '0 20px 60px -20px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08)',
        glow: '0 0 40px rgba(52,211,153,.35)',
      },
      colors: {
        ink:       '#0B0D12',
        surface:   '#14171F',
        elevated:  '#1A1E28',
        fg:        '#F5F7FA',
        muted:     '#8A93A6',
        success:   '#34D399',
        warning:   '#FCD34D',
        danger:    '#F87171',
        referral:  '#A78BFA',
      },
      backgroundImage: {
        'money-gradient':     'linear-gradient(135deg, #34D399 0%, #A3E635 100%)',
        'hero-gradient':      'linear-gradient(135deg, #0F2A24 0%, #163A4A 50%, #0F2438 100%)',
        'referral-gradient':  'linear-gradient(135deg, #A78BFA 0%, #F0ABFC 100%)',
        'milestone-gradient': 'linear-gradient(135deg, #FCD34D 0%, #FB923C 100%)',
      },
      animation: {
        'fade-up': 'fadeUp .5s cubic-bezier(0.21, 1.02, 0.73, 1) both',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
