/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        ozean: {
          light: '#7dd3fc',
          DEFAULT: '#0ea5e9',
          deep: '#0369a1',
        },
      },
      fontFamily: {
        spiel: ['"Baloo 2"', '"Comic Sans MS"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        bumm: {
          '0%': { transform: 'scale(0.4)', opacity: '0' },
          '60%': { transform: 'scale(1.25)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        wackeln: {
          '0%,100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        // Schiff sinkt: kippt, rutscht runter und verblasst.
        sinken: {
          '0%': { transform: 'translateY(-10px) rotate(0deg)', opacity: '1' },
          '25%': { transform: 'translateY(0) rotate(-8deg)', opacity: '1' },
          '60%': { transform: 'translateY(35px) rotate(-22deg)', opacity: '0.9' },
          '100%': { transform: 'translateY(120px) rotate(-38deg)', opacity: '0' },
        },
        // Wellen, die nach dem Untergang über die Stelle schwappen.
        schwappen: {
          '0%,100%': { transform: 'translateX(-4%) scaleY(1)' },
          '50%': { transform: 'translateX(4%) scaleY(1.15)' },
        },
        // Luftblasen, die nach oben steigen.
        blubbern: {
          '0%': { transform: 'translateY(20px) scale(0.4)', opacity: '0' },
          '30%': { opacity: '0.8' },
          '100%': { transform: 'translateY(-60px) scale(1)', opacity: '0' },
        },
      },
      animation: {
        bumm: 'bumm 0.35s ease-out',
        wackeln: 'wackeln 0.8s ease-in-out infinite',
        sinken: 'sinken 2.6s ease-in forwards',
        schwappen: 'schwappen 2.4s ease-in-out infinite',
        blubbern: 'blubbern 2.2s ease-in infinite',
      },
    },
  },
  plugins: [],
};
