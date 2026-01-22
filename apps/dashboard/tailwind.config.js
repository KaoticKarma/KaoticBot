/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'kick-green': '#53fc18',
        'kick-dark': '#0e0e10',
        'kick-bg': '#18181b',
        'kick-light': '#1f1f23',
        'kick-border': '#2d2d31',
      },
    },
  },
  plugins: [],
};
