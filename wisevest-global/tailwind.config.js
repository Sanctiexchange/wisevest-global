/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F7F8F7',
        surface: '#FFFFFF',
        surface2: '#F2F4F2',
        line: '#E6E9E6',
        ink: '#101828',
        muted: '#6B7280',
        neon: '#0F3D33',
        violet: '#0B322A',
        orchid: '#0F3D33',
        danger: '#B4233C',
        amber: '#8A6500',
      },
      fontFamily: {
        head: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        body: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      backgroundImage: {
        brand: 'linear-gradient(135deg,#0F3D33,#BBEC04)',
        'brand-soft': 'linear-gradient(135deg,rgba(15,61,51,.08),rgba(187,236,4,.16))',
      },
      boxShadow: { glow: '0 4px 18px rgba(15,61,51,.16)' },
      borderRadius: { xl2: '16px' },
    },
  },
  plugins: [],
}
