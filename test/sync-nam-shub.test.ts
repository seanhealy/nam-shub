import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { syncNamShub } from "../skills/sync-nam-shub/sync-nam-shub.ts";

describe("syncNamShub()", () => {
	let repository: string;
	let source: string;

	beforeEach(() => {
		repository = makeDirectory();
	});

	beforeEach(() => {
		source = makeSource({
			core: "Write less code.",
			skills: { "pr-review": { "SKILL.md": "New review steps." } },
		});
	});

	describe("without an instructions file", () => {
		it("creates CLAUDE.md with the block", () => {
			const { commit } = syncNamShub(repository, source);

			assert.equal(
				read(repository, "CLAUDE.md"),
				`<!-- BEGIN:nam-shub@${commit} -->\n<!-- prettier-ignore-start -->\n\nWrite less code.\n\n<!-- prettier-ignore-end -->\n<!-- END:nam-shub -->\n`,
			);
		});

		it("reports no previous commit", () => {
			const { previous } = syncNamShub(repository, source);

			assert.equal(previous, undefined);
		});
	});

	describe("with an AGENTS.md", () => {
		beforeEach(() => {
			write(repository, "AGENTS.md", "# Project One\n\nRun npm test.\n");
		});

		it("puts the block above everything already there", () => {
			const { commit } = syncNamShub(repository, source);

			assert.equal(
				read(repository, "AGENTS.md"),
				`<!-- BEGIN:nam-shub@${commit} -->\n<!-- prettier-ignore-start -->\n\nWrite less code.\n\n<!-- prettier-ignore-end -->\n<!-- END:nam-shub -->\n\n# Project One\n\nRun npm test.\n`,
			);
		});

		it("doesn't create CLAUDE.md", () => {
			syncNamShub(repository, source);

			assert.equal(existsSync(join(repository, "CLAUDE.md")), false);
		});
	});

	describe("with a block from an earlier sync", () => {
		beforeEach(() => {
			write(
				repository,
				"AGENTS.md",
				"<!-- BEGIN:nam-shub@1234567 -->\n\nOld rule.\n\n<!-- END:nam-shub -->\n\n# Project One\n",
			);
		});

		it("replaces the block whole", () => {
			const { commit } = syncNamShub(repository, source);

			assert.equal(
				read(repository, "AGENTS.md"),
				`<!-- BEGIN:nam-shub@${commit} -->\n<!-- prettier-ignore-start -->\n\nWrite less code.\n\n<!-- prettier-ignore-end -->\n<!-- END:nam-shub -->\n\n# Project One\n`,
			);
		});

		it("reports the commit it replaced", () => {
			const { previous } = syncNamShub(repository, source);

			assert.equal(previous, "1234567");
		});

		describe("with dollar signs in the core", () => {
			beforeEach(() => {
				source = makeSource({
					core: "Prices look like $5 and $& stays.",
					skills: { "pr-review": { "SKILL.md": "New review steps." } },
				});
			});

			it("keeps them exactly as written", () => {
				syncNamShub(repository, source);

				assert.match(
					read(repository, "AGENTS.md"),
					/Prices look like \$5 and \$& stays\./,
				);
			});
		});
	});

	describe("with CLAUDE.md linked to AGENTS.md", () => {
		beforeEach(() => {
			write(repository, "AGENTS.md", "# Project One\n");
		});

		beforeEach(() => {
			symlinkSync("AGENTS.md", join(repository, "CLAUDE.md"));
		});

		it("writes the block into AGENTS.md", () => {
			syncNamShub(repository, source);

			assert.match(
				read(repository, "AGENTS.md"),
				/Write less code\.[\s\S]*# Project One/,
			);
		});

		it("leaves the link in place", () => {
			syncNamShub(repository, source);

			assert.equal(
				lstatSync(join(repository, "CLAUDE.md")).isSymbolicLink(),
				true,
			);
		});
	});

	describe("with skills already in the repo", () => {
		beforeEach(() => {
			write(repository, ".claude/skills/pr-review/SKILL.md", "Old review steps.");
			write(repository, ".claude/skills/pr-review/removed.md", "Gone upstream.");
		});

		beforeEach(() => {
			write(repository, ".claude/skills/deploy/SKILL.md", "This repo's own skill.");
		});

		it("replaces a shared skill whole", () => {
			syncNamShub(repository, source);

			assert.equal(
				read(repository, ".claude/skills/pr-review/SKILL.md"),
				"New review steps.",
			);
			assert.equal(
				existsSync(join(repository, ".claude/skills/pr-review/removed.md")),
				false,
			);
		});

		it("leaves the repo's own skills alone", () => {
			syncNamShub(repository, source);

			assert.equal(
				read(repository, ".claude/skills/deploy/SKILL.md"),
				"This repo's own skill.",
			);
		});

		it("reports the shared skills it wrote", () => {
			const { skills } = syncNamShub(repository, source);

			assert.deepEqual(skills, ["pr-review"]);
		});
	});

	describe("when the source can't be cloned", () => {
		beforeEach(() => {
			write(repository, "AGENTS.md", "# Project One\n");
		});

		it("throws", () => {
			assert.throws(() => syncNamShub(repository, join(makeDirectory(), "missing")));
		});

		it("leaves the repo untouched", () => {
			assert.throws(() => syncNamShub(repository, join(makeDirectory(), "missing")));

			assert.equal(read(repository, "AGENTS.md"), "# Project One\n");
		});
	});
});

function makeSource(contents: {
	core: string;
	skills: Record<string, Record<string, string>>;
}) {
	const source = makeDirectory();
	write(source, "core.md", `${contents.core}\n`);
	Object.entries(contents.skills).forEach(([skill, files]) => {
		Object.entries(files).forEach(([file, text]) => {
			write(source, join("skills", skill, file), text);
		});
	});
	git(source, "init", "--quiet");
	git(source, "add", "--all");
	git(source, "commit", "--quiet", "--allow-empty", "-m", "nam-shub");
	return source;
}

function makeDirectory() {
	return mkdtempSync(join(tmpdir(), "nam-shub-test-"));
}

function write(directory: string, path: string, text: string) {
	mkdirSync(join(directory, path, ".."), { recursive: true });
	writeFileSync(join(directory, path), text);
}

function read(directory: string, path: string) {
	return readFileSync(join(directory, path), "utf8");
}

function git(directory: string, ...args: string[]) {
	const identity = ["-c", "user.name=Test", "-c", "user.email=test@example.com"];
	execFileSync("git", ["-C", directory, ...identity, ...args]);
}
