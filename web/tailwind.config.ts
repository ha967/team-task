import type { Config } from 'tailwindcss';

// 设计 token 来自 vibefather/e-commerce-admin-dashboard/DESIGN.md
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: '#F4F5F7',
        panel: '#FFFFFF',
        'panel-2': '#F7F8FA',
        line: '#E3E5EA',
        ink: '#171A20',
        softink: '#5F6570',
        indigo: '#4F46E5',
        'indigo-deep': '#3B34B8',
        'indigo-mist': '#EEEDFC',
        mint: '#2F9E6E',
        amber: '#C77E1D',
        ruby: '#C24141',
        'slate-ink': '#12131A',
        good: '#2F9E6E',
      },
      fontFamily: {
        sans: [
          'Instrument Sans Variable',
          'system-ui',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Consolas',
          'monospace',
        ],
      },
      borderRadius: {
        DEFAULT: '10px',
      },
      maxWidth: {
        shell: '1480px',
      },
      screens: {
        nav: '900px',
      },
      transitionTimingFunction: {
        'ease-io': 'cubic-bezier(0.65, 0, 0.35, 1)',
        'ease-out-soft': 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
