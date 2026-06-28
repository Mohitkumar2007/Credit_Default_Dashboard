/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: "#0a0e17",
        panel: "#141b2c",
        panel2: "#0f1422",
        muted: "#8b95ab",
        dim: "#5d6679",
        indigo: "#7c8cff",
        good: "#34d8a0",
        warn: "#ffb24d",
        bad: "#f0573f",
      },
      boxShadow: {
        panel: "0 24px 60px -24px rgba(0,0,0,.7)",
      },
    },
  },
  plugins: [],
};
