import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const changelogPath = resolve(__dirname, "docs-src", "changelog.md");
const outputPath = resolve(__dirname, "src", "notable-changes.ts");

const changelog = readFileSync(changelogPath, "utf-8");

const sections = changelog.split(/(?=^### )/m);
const entries = [];

for (const section of sections) {
	const headingMatch = section.match(/^### (.+?)\s*\{ #([\d.]+) \}/);
	if (!headingMatch) continue;

	const headingText = headingMatch[1];
	const anchor = headingMatch[2];

	// Extract the latest (highest) version number from the heading text
	const versions = headingText.match(/\d+\.\d+\.\d+/g);
	const version = versions
		? versions.sort((a, b) => {
				const ap = a.split(".").map(Number);
				const bp = b.split(".").map(Number);
				for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
					const d = (ap[i] || 0) - (bp[i] || 0);
					if (d !== 0) return d;
				}
				return 0;
		  }).pop()
		: anchor;

	const bullets = [];
	for (const line of section.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.startsWith("- ")) {
			bullets.push(trimmed.slice(2));
		}
	}

	if (bullets.length === 0) continue;

	const title = bullets[0];
	const description = bullets.slice(1).join("\n");

	entries.push({ version, title, description, anchor });
}

entries.sort((a, b) => {
	const aParts = a.version.split(".").map(Number);
	const bParts = b.version.split(".").map(Number);
	for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
		const aNum = aParts[i] || 0;
		const bNum = bParts[i] || 0;
		if (aNum !== bNum) return aNum - bNum;
	}
	return 0;
});

const ts = `export interface NotableChange {
\tversion: string;
\ttitle: string;
\tdescription: string;
\tanchor: string;
}

export const NOTABLE_CHANGES: NotableChange[] = [
${entries.map(e => `\t{
\t\tversion: '${e.version}',
\t\ttitle: ${JSON.stringify(e.title)},
\t\tdescription: ${JSON.stringify(e.description)},
\t\tanchor: '${e.anchor}',
\t}`).join(",\n")}
];
`;

writeFileSync(outputPath, ts, "utf-8");
console.log(`Updated ${outputPath} with ${entries.length} entries.`);
