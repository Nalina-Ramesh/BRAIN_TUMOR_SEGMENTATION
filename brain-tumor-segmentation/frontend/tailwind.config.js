/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        navy: { 50: "#f1f5fb", 100: "#dde6f3", 200: "#b9c9e3", 300: "#8aa3cc", 400: "#5b7db3", 500: "#3a5f99", 600: "#2a4a7d", 700: "#1f3a66", 800: "#162c4f", 900: "#0e1f3a", 950: "#091428" },
        teal: { 50: "#effcfa", 100: "#d1f7f1", 200: "#a6ede3", 300: "#6fdccf", 400: "#3cc4b8", 500: "#1faaa0", 600: "#168982", 700: "#166d69", 800: "#165757", 900: "#154848" },
      },
      boxShadow: { card: "0 1px 2px rgba(14,31,58,.05), 0 8px 24px -8px rgba(14,31,58,.10)" },
    },
  },
  plugins: [],
};
