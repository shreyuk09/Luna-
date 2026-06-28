/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Quicksand', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Fixed seagreen accents (read well in both light & dark)
        sea: '#45B5A6',        // primary accent / icons
        deep: '#218074',       // CTAs, key button backgrounds
        accentink: 'var(--accent-ink)', // accent TEXT (mode-aware, AA)
        signature: '#9FDDD2',  // signature light seagreen
        tint: 'var(--tint)',   // soft seagreen tint (mode-aware)
        userfill: '#CFF0E9',   // user message fill (stays seafoam in both modes)
        // Mode-dependent semantic roles (driven by CSS variables)
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        ink: 'var(--ink)',     // text primary
        ink2: 'var(--ink-2)',  // text secondary
        line: 'var(--line)',   // borders / dividers
        // Back-compat alias used by older components → maps to seagreen
        accent: { DEFAULT: '#45B5A6', fg: '#218074', soft: '#DBF1EC' },
      },
      borderRadius: { '2xl': '1.25rem', '3xl': '1.75rem' },
      boxShadow: {
        lagoon: '0 8px 30px rgba(69,181,166,0.15)',
        'lagoon-lg': '0 18px 50px rgba(69,181,166,0.20)',
        'lagoon-sm': '0 4px 16px rgba(69,181,166,0.12)',
        focusring: '0 0 0 4px rgba(69,181,166,0.22)',
      },
      keyframes: {
        'fade-rise': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: 0, transform: 'translateY(3px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        blink: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
        breathe: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(69,181,166,0.0), 0 8px 30px rgba(69,181,166,0.12)' },
          '50%': { boxShadow: '0 0 0 4px rgba(69,181,166,0.20), 0 10px 34px rgba(69,181,166,0.18)' },
        },
        'dot-pulse': { '0%,100%': { opacity: 0.35, transform: 'translateY(0)' }, '50%': { opacity: 1, transform: 'translateY(-2px)' } },
        float: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(0,-18px) scale(1.04)' } },
        'float-slow': { '0%,100%': { transform: 'translate(0,0)' }, '50%': { transform: 'translate(14px,-12px)' } },
        tide: { '0%': { backgroundPosition: '0% 50%' }, '100%': { backgroundPosition: '100% 50%' } },
        ripple: { from: { transform: 'scale(0)', opacity: 0.5 }, to: { transform: 'scale(2.6)', opacity: 0 } },
      },
      animation: {
        'fade-rise': 'fade-rise .3s cubic-bezier(.22,.61,.36,1) both',
        'fade-in': 'fade-in .25s ease both',
        blink: 'blink 1.1s step-end infinite',
        breathe: 'breathe 3.2s ease-in-out infinite',
        'dot-pulse': 'dot-pulse 1.2s ease-in-out infinite',
        float: 'float 14s ease-in-out infinite',
        'float-slow': 'float-slow 22s ease-in-out infinite',
        tide: 'tide 24s ease-in-out infinite alternate',
        ripple: 'ripple .6s ease-out forwards',
      },
    },
  },
  plugins: [],
}
