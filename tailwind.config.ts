import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0A1628", 800: "#0E1A30", 700: "#13243F", 600: "#1E3A5F" },
        cyan: { brand: "#06B6D4", light: "#A5F3FC" },
        ink: "#1E293B",
        edge: "#CBD5E1",
      },
    },
  },
  plugins: [],
};

export default config;
