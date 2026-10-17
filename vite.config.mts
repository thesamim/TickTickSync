import * as path from "path";
import {resolve} from "path";
import {copyFileSync, mkdirSync} from "node:fs";
import { builtinModules as builtins } from "node:module";
import {svelte, vitePreprocess} from '@sveltejs/vite-plugin-svelte';
import {type Plugin, type UserConfig} from "vite";
import {configDefaults, defineConfig} from "vitest/config";
import {pathToFileURL} from "node:url";

const DEV_PATH = path.join("..", "test-vault", ".obsidian", "plugins", "tickticksync");
// const DEV_PATH = path.join("G:\\My Drive\\SyncFolder\\Obsidian\\", "test-vault-syncthing", ".obsidian", "plugins", "tickticksync");
function getOutDir(prod: boolean): string | undefined {
	if (!prod)
		return DEV_PATH;
	return undefined;
}

function copyManifest(): Plugin {
	let outDir: string;
	return {
		name: "copy-manifest",
		configResolved(config) {
			outDir = config.build.outDir;
		},
		closeBundle() {
			mkdirSync(outDir, {recursive: true});
			copyFileSync(resolve(__dirname, "manifest.json"), resolve(outDir, "manifest.json"));
		},
	};
}

export default defineConfig(({mode}) => {
	const prod = mode === 'production';
	return {
		resolve: {
			tsconfigPaths: true,
			// Bypass dexie's ESM import wrappers (import-wrapper(-prod).mjs), which
			// register on globalThis[Symbol.for("Dexie")] and throw if another plugin
			// bundled a different Dexie semVer (issue #401). The core build in dist/
			// has no global registration, so each plugin keeps its own private copy.
			alias: {
				dexie: resolve(__dirname, "node_modules/dexie/dist/dexie.mjs"),
			},
		},
		plugins: [
			svelte({
				preprocess: [vitePreprocess()]
			}),
			copyManifest(),

		],
		build: {
			// We aren't building a website, so we build in library mode
			lib: {
				entry: resolve(__dirname, "src/main.ts"),
				fileName: "main",
				formats: ["cjs"],
			},
			minify: prod,
			sourcemap: prod ? false : 'inline',
			rollupOptions: {
				external: [
					"obsidian",
					"electron",
					"typescript",
					"@codemirror/autocomplete",
					"@codemirror/collab",
					"@codemirror/commands",
					"@codemirror/language",
					"@codemirror/lint",
					"@codemirror/search",
					"@codemirror/state",
					"@codemirror/view",
					"@lezer/common",
					"@lezer/highlight",
					"@lezer/lr",
					...builtins,
				],
				output: {
					// Overwrite default Vite output fileName
					codeSplitting: false,
					manualChunks: undefined,
					entryFileNames: 'main.js',
					chunkFileNames: 'main.js',
					assetFileNames: 'styles.css',
					sourcemapBaseUrl: pathToFileURL(
						DEV_PATH,
					).toString(),
				},

				// Ensure Node/Electron globals aren’t polyfilled into browser code
				optimizeDeps: {
					exclude: [
						'electron',
						'@capacitor/browser'
					]
				},
				// Prevent Vite from trying to polyfill Node built-ins for browser
				define: {
					'process.env': {}
				}
			},
			outDir: getOutDir(prod),
		},
		test: {
			watch: false,
			exclude: [...configDefaults.exclude, ".direnv/**/*"],
			globals: true,
			environment: "jsdom",
			alias: {
				obsidian: resolve(__dirname, "src/test/AppPluginDefinitions.ts"),
				"@": resolve(__dirname, "src"),
			},
			setupFiles: ["./vitest-setup.ts"],
		},
	} as UserConfig;
});
