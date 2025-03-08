/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      './app/**/*.{js,ts,jsx,tsx,mdx}',
      './pages/**/*.{js,ts,jsx,tsx,mdx}',
      './components/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
      extend: {
        colors: {
          primary: {
            light: '#4d8c6f', // Lighter forest green
            DEFAULT: '#2c6e49', // Forest green
            dark: '#1a472a', // Darker forest green
          },
          secondary: {
            light: '#f8f8f2', // Light background
            DEFAULT: '#e9e9e3', // Neutral background
            dark: '#4a4a40', // Dark text
          }
        },
        fontFamily: {
          sans: ['Inter', 'sans-serif'],
        },
      },
    },
    plugins: [],
  }
  