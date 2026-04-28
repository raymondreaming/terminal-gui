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
			entrypoint: "src/index.ts",
			format: "esm",
			sourcemap: "external",
		},
		copy: {
			dist: "views",
			data: "data",
			native: "native",
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
