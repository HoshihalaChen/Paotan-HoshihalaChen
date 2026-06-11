/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: {
          bg: '#F5F0E8',
          card: '#FAF7F2',
          dark: '#E8E2D8',
          darker: '#D8D2C8',
        },
        sidebar: {
          bg: '#3A3A3C',
          hover: '#4A4A4C',
          active: '#505052',
          text: '#C5C0BA',
          textActive: '#F5F0E8',
        },
        ink: {
          primary: '#4A4540',
          secondary: '#6B6560',
          muted: '#8B8580',
        }
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Source Han Serif SC"', 'SimSun', 'serif'],
        sans: ['"Noto Serif SC"', '"Source Han Serif SC"', 'SimSun', 'serif'],
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: 'inset 0 0 0 1px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        'card-hover': 'inset 0 0 0 1px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06)',
      }
    },
  },
  plugins: [],
}
