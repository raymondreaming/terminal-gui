import type { ElectrobunConfig } from "electrobun";

const config: ElectrobunConfig = {
	app: {
		name: "inferay",
		identifier: "com.inferay.app",
		version: "1.0.0",
		description: "Run Claude and Codex side by side in a multi-pane terminal",
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
			codesign: false,
			notarize: false,
			createDmg: true,
		},
	},
	runtime: {
		exitOnLastWindowClosed: true,
	},
};

export default config;
