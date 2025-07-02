/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: 'inherit',
            a: {
              color: '#0EA5E9',
              '&:hover': {
                color: '#0284C7',
              },
            },
            strong: {
              color: 'inherit',
            },
            code: {
              color: 'inherit',
              backgroundColor: '#1F2937',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem',
            },
            'code::before': {
              content: '""',
            },
            'code::after': {
              content: '""',
            },
          },
        },
      },
      animation: {
        'gradient-1': 'gradient1 15s ease-in-out infinite',
        'gradient-2': 'gradient2 18s ease-in-out infinite',
        'gradient-flow': 'gradientFlow 12s linear infinite',
        'gradient': 'gradient 3s ease infinite',
        'upload-bounce': 'upload-bounce 1s infinite',
        'upload-pulse': 'upload-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        gradient1: {
          '0%, 100%': {
            opacity: '0.4',
            transform: 'translate(0px, 0px) scale(1)',
          },
          '50%': {
            opacity: '0.2',
            transform: 'translate(50px, 50px) scale(1.2)',
          }
        },
        gradient2: {
          '0%, 100%': {
            opacity: '0.3',
            transform: 'translate(0px, 0px) scale(1)',
          },
          '50%': {
            opacity: '0.4',
            transform: 'translate(-50px, -50px) scale(1.1)',
          }
        },
        gradientFlow: {
          '0%': { transform: 'translateX(-200%)' },
          '100%': { transform: 'translateX(200%)' },
        },
        'upload-pulse': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: .5 },
        },
        'upload-bounce': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-25%)' },
        },
        gradient: {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
      },
      backgroundSize: {
        '300%': '300%'
      }
    }
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}