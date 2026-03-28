import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	plugins: [
		react({
			babel: {
				plugins: ["babel-plugin-react-compiler"],
			},
		}),
		tailwindcss(),
	],
	server: {
		port: 4000,
		proxy: {
			"/api": {
				target: "http://localhost:4001",
				changeOrigin: true,
			},
			"/ws": {
				target: "ws://localhost:4001",
				ws: true,
			},
			"/logo.png": "http://localhost:4001",
			"/app-icon.png": "http://localhost:4001",
			"/icon-192.png": "http://localhost:4001",
			"/icon-512.png": "http://localhost:4001",
			"/manifest.json": "http://localhost:4001",
			"/sw.js": "http://localhost:4001",
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});
