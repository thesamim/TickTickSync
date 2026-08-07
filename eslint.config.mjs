// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	...obsidianmd.configs.recommended,
	{
		ignores: ["src/zzz_noodling/**", "src/test/**", "main.js"],
	},

	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { project: "./tsconfig.json" },
		},

		rules: {
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					brands: ["TickTickSync"],
				},
			],
			"obsidianmd/settings-tab/no-deprecated-display": "off",
		},
	},
]);
