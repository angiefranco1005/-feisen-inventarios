/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        feisen: {
          rojo: '#B4271D',
          'rojo-claro': '#D9534F',
          azul: '#064794',
          'azul-claro': '#1A6BC4',
          gris: '#F4F5F7',
          'gris-medio': '#9CA3AF',
          'gris-oscuro': '#4B5563',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
