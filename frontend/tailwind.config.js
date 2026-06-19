/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Colors are driven by CSS variables (RGB channel triplets defined in
      // styles.scss) so the admin panel can swap themes at runtime. Defaults
      // reproduce the original hex exactly, so the rest of the app is unchanged.
      colors: {
        primary: 'rgb(var(--c-primary) / <alpha-value>)',
        'primary-dark': 'rgb(var(--c-primary-dark) / <alpha-value>)',
        glow: 'rgb(var(--c-glow) / <alpha-value>)',
        ink: {
          900: 'rgb(var(--c-ink-900) / <alpha-value>)',
          800: 'rgb(var(--c-ink-800) / <alpha-value>)',
          700: 'rgb(var(--c-ink-700) / <alpha-value>)',
          500: 'rgb(var(--c-ink-500) / <alpha-value>)',
          400: 'rgb(var(--c-ink-400) / <alpha-value>)',
          300: 'rgb(var(--c-ink-300) / <alpha-value>)',
          200: 'rgb(var(--c-ink-200) / <alpha-value>)',
          100: 'rgb(var(--c-ink-100) / <alpha-value>)'
        },
        'dark-bg': 'rgb(var(--c-dark-bg) / <alpha-value>)',
        success:  'rgb(var(--c-success) / <alpha-value>)',
        warning:  'rgb(var(--c-warning) / <alpha-value>)',
        danger:   'rgb(var(--c-danger) / <alpha-value>)',
        info:     'rgb(var(--c-info) / <alpha-value>)',
        verified: 'rgb(var(--c-verified) / <alpha-value>)'
      },
      fontFamily: {
        // Headings now use Plus Jakarta Sans; Space Grotesk kept as a fallback
        // for any legacy usage. Body = Inter, eyebrows/meta = JetBrains Mono.
        display: ['"Plus Jakarta Sans"', '"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      transitionTimingFunction: {
        standard: 'var(--ease)'
      }
    }
  },
  plugins: []
};
