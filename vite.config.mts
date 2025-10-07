import * as path from "path";
import {resolve} from "path";
import builtins from "builtin-modules";
import {svelte, vitePreprocess} from '@sveltejs/vite-plugin-svelte';
import {type UserConfig} from "vite";
import {viteStaticCopy} from "vite-plugin-static-copy";
import tsConfigPaths from "vite-tsconfig-paths";
import {configDefaults, defineConfig} from "vitest/config";
import {pathToFileURL} from "node:url";

const DEV_PATH = path.join("..", "test-vault", ".obsidian", "plugins", "tickticksync");
function getOutDir(prod: boolean): string | undefined {
	if (!prod)
		return DEV_PATH;
	return undefined;
}

export default defineConfig(({mode}) => {
	const prod = mode === 'production';
	return {
		plugins: [
			svelte({
				preprocess: [vitePreprocess()]
			}),
			tsConfigPaths(),
			viteStaticCopy({
				targets: [
					{
						src: "./manifest.json",
						dest: "",
					},
				],
			}),
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
					manualChunks: undefined,
					inlineDynamicImports: true,
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
				obsidian: resolve(__dirname, "src/mocks/obsidian.ts"),
			},
			setupFiles: ["./vitest-setup.ts"],
		},
	} as UserConfig;
});
