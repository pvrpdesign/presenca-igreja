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
        ink: "#26141c",
        paper: "#fbf7f8",
        surface: "#ffffff",
        line: "#eadde2",
        forest: "#780032",
        forestDark: "#570024",
        wine: "#9c1748",
        gold: "#b89a5e",
        muted: "#71636a"
      },
      boxShadow: {
        soft: "0 14px 38px rgba(87, 0, 36, 0.08)",
        lift: "0 18px 48px rgba(87, 0, 36, 0.14)"
      },
      borderRadius: {
        card: "14px"
      }
    }
  },
  plugins: []
};

export default config;
