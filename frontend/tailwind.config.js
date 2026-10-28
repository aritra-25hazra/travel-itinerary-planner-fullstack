/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: "#0F5C5C", 50: "#E6F0F2", 100: "#CFE3E6", 400: "#1D8A8A", 600: "#0F5C5C", 700: "#0B4646" },
        coral: { DEFAULT: "#FF6B5B", 100: "#FFE3DF", 600: "#E8533F" },
        sand: { DEFAULT: "#FBF5EC", 200: "#F3E8D6" },
        ink: "#1E2A32",
        muted: "#5B6B74",
      },
      fontFamily: {
        display: ["'Playfair Display'", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: { card: "0 6px 18px rgba(30,42,50,.06)", hero: "0 12px 32px rgba(15,92,92,.22)" },
    },
  },
  plugins: [],
};
