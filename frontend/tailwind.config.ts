import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    50:  "#eef6ff",
                    100: "#d9ebff",
                    500: "#3b82f6",
                    600: "#2563eb",
                    900: "#1e3a5f",
                },
                surface: {
                    DEFAULT: "#0f172a",
                    card:    "#1e293b",
                    border:  "#334155",
                },
            },
            fontFamily: {
                // System fonts — no Google Fonts network request needed
                sans: ["system-ui", "ui-sans-serif", "sans-serif"],
                mono: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
            },
        },
    },
    plugins: [],
};
export default config;