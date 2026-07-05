import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#202820",
        paper: "#f7f8f5",
        surface: "#ffffff",
        line: "#dfe5dc",
        forest: "#1f6f5b",
        forestDark: "#174d42",
        wine: "#8d334f",
        gold: "#b99b35",
        muted: "#657064"
      },
      boxShadow: {
        soft: "0 12px 30px rgba(32, 40, 32, 0.08)"
      },
      borderRadius: {
        card: "8px"
      }
    }
  },
  plugins: []
};

export default config;
