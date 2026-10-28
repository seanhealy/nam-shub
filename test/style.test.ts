import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..");
const canadianSpellings = { behavior: "behaviour", judgment: "judgement" };
const emDash = "—";

describe("nam-shub Markdown", () => {
	it("uses Canadian spelling", () => {
		const problems = findLines((line) =>
			Object.entries(canadianSpellings)
				.filter(([american]) => line.toLowerCase().includes(american))
				.map(
					([american, canadian]) =>
						`"${american}": nam-shub uses Canadian spelling: ${canadian}, not ${american}`,
				),
		);

		assert.deepEqual(problems, []);
	});

	it("has no em dashes", () => {
		const problems = findLines((line) =>
			line.includes(emDash) ? ["em dash: no em dashes: end the sentence or use a comma"] : [],
		);

		assert.deepEqual(problems, []);
	});
});

function findLines(check: (line: string) => string[]) {
	return markdownFiles().flatMap((file) =>
		readFileSync(join(root, file), "utf8")
			.split("\n")
			.flatMap((line, index) => check(line).map((problem) => `${file}:${index + 1}: ${problem}`)),
	);
}

function markdownFiles() {
	const skills = readdirSync(join(root, "skills"), { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".md"))
		.map((file) => join("skills", file));
	return ["core.md", "README.md", ...skills];
}
