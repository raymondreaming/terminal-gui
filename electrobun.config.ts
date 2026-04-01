import type { ElectrobunConfig } from "electrobun";

const config: ElectrobunConfig = {
	app: {
		name: "Terminal GUI",
		identifier: "com.realitydesigners.terminal-gui",
		version: "1.0.0",
		description: "AI-powered multi-pane terminal desktop app",
	},
	build: {
		bun: {
			entrypoint: "src/bun/index.ts",
			format: "esm",
			sourcemap: "external",
		},
		copy: {
			"dist/index.html": "views/index.html",
			"dist/main.js": "views/main.js",
			"dist/main.css": "views/main.css",
			"dist/main.js.map": "views/main.js.map",
			data: "data",
			public: "public",
		},
		mac: {
			icons: "public/icon.iconset",
			createDmg: true,
		},
	},
	runtime: {
		exitOnLastWindowClosed: true,
	},
};

export default config;
