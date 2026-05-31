import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#020813',
          900: '#040D1A',
          800: '#0B1525',
          700: '#0F1E35',
          600: '#162540',
        },
        gold: {
          300: '#f1c56a',
          400: '#e8b84d',
          500: '#d5a538',
          600: '#b88a25',
          700: '#a97918',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
