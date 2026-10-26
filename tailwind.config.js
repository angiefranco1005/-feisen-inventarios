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
          // Diseño 2026 (igual a la app de OF, inspirado en Linear): fondos, bordes y textos más finos
          fondo: '#F7F8FA',
          borde: '#E3E6EB',
          'borde-suave': '#EEF0F3',
          texto: '#1F2937',
          'texto-2': '#5B6472',
          'azul-suave': '#E8EEF7',
          'rojo-suave': '#FCEBEB',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
