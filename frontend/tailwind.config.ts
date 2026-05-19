import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdf4",
          500: "#22c55e",
          900: "#14532d",
        },
        ink: "#060609",
        lime: { DEFAULT: "#c6ff00", dim: "#a3d400" },
        coral: "#ff4f4f",
        sky: "#3b9eff",
        gold: "#f0b429",
        lavender: "#9d78f8",
      },
      fontFamily: {
        display: ['"Bebas Neue"', "sans-serif"],
        "serif-display": ['"DM Serif Display"', "serif"],
        outfit: ['"Outfit"', "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
