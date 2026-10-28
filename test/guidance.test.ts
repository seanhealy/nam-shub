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
import { describe, it } from "node:test";
import { syncGuidance } from "../skills/sync-nam-shub/guidance.ts";

describe("syncGuidance", () => {
	it("creates CLAUDE.md with the core block in a repo that has no instructions file", () => {
		const source = makeSource({ core: "Write less code." });
		const repository = makeDirectory();

		const { previous, commit } = syncGuidance(repository, source);

		assert.equal(previous, undefined);
		assert.equal(
			read(repository, "CLAUDE.md"),
			`<!-- BEGIN:guidance@${commit} -->\n\nWrite less code.\n\n<!-- END:guidance -->\n`,
		);
	});

	it("puts the block above an existing AGENTS.md and keeps everything already there", () => {
		const source = makeSource({ core: "Write less code." });
		const repository = makeDirectory();
		write(repository, "AGENTS.md", "# Project One\n\nRun npm test.\n");

		const { commit } = syncGuidance(repository, source);

		assert.equal(
			read(repository, "AGENTS.md"),
			`<!-- BEGIN:guidance@${commit} -->\n\nWrite less code.\n\n<!-- END:guidance -->\n\n# Project One\n\nRun npm test.\n`,
		);
		assert.equal(existsSync(join(repository, "CLAUDE.md")), false);
	});

	it("replaces an existing block whole and reports the commit it replaced", () => {
		const source = makeSource({ core: "Write less code." });
		const repository = makeDirectory();
		write(
			repository,
			"AGENTS.md",
			"<!-- BEGIN:guidance@1234567 -->\n\nOld rule.\n\n<!-- END:guidance -->\n\n# Project One\n",
		);

		const { previous, commit } = syncGuidance(repository, source);

		assert.equal(previous, "1234567");
		assert.equal(
			read(repository, "AGENTS.md"),
			`<!-- BEGIN:guidance@${commit} -->\n\nWrite less code.\n\n<!-- END:guidance -->\n\n# Project One\n`,
		);
	});

	it("keeps dollar signs in the core exactly as written", () => {
		const source = makeSource({ core: "Prices look like $5 and $& stays." });
		const repository = makeDirectory();
		write(
			repository,
			"AGENTS.md",
			"<!-- BEGIN:guidance@1234567 -->\n\nOld rule.\n\n<!-- END:guidance -->\n",
		);

		syncGuidance(repository, source);

		assert.match(read(repository, "AGENTS.md"), /Prices look like \$5 and \$& stays\./);
	});

	it("writes through a CLAUDE.md symlink to AGENTS.md and leaves the link in place", () => {
		const source = makeSource({ core: "Write less code." });
		const repository = makeDirectory();
		write(repository, "AGENTS.md", "# Project One\n");
		symlinkSync("AGENTS.md", join(repository, "CLAUDE.md"));

		syncGuidance(repository, source);

		assert.equal(lstatSync(join(repository, "CLAUDE.md")).isSymbolicLink(), true);
		assert.match(read(repository, "AGENTS.md"), /Write less code\.[\s\S]*# Project One/);
	});

	it("replaces a shared skill whole and leaves the repo's own skills alone", () => {
		const source = makeSource({
			core: "Write less code.",
			skills: { "pr-review": { "SKILL.md": "New review steps." } },
		});
		const repository = makeDirectory();
		write(repository, ".claude/skills/pr-review/SKILL.md", "Old review steps.");
		write(repository, ".claude/skills/pr-review/removed.md", "Gone upstream.");
		write(repository, ".claude/skills/deploy/SKILL.md", "This repo's own skill.");

		const { skills } = syncGuidance(repository, source);

		assert.deepEqual(skills, ["pr-review"]);
		assert.equal(read(repository, ".claude/skills/pr-review/SKILL.md"), "New review steps.");
		assert.equal(existsSync(join(repository, ".claude/skills/pr-review/removed.md")), false);
		assert.equal(read(repository, ".claude/skills/deploy/SKILL.md"), "This repo's own skill.");
	});

	it("fails without touching the repo when the source can't be cloned", () => {
		const repository = makeDirectory();
		write(repository, "AGENTS.md", "# Project One\n");

		assert.throws(() => syncGuidance(repository, join(makeDirectory(), "missing")));
		assert.equal(read(repository, "AGENTS.md"), "# Project One\n");
	});
});

function makeSource(contents: {
	core: string;
	skills?: Record<string, Record<string, string>>;
}) {
	const source = makeDirectory();
	const skills = contents.skills ?? { "pr-review": { "SKILL.md": "Review steps." } };
	write(source, "core.md", `${contents.core}\n`);
	Object.entries(skills).forEach(([skill, files]) => {
		Object.entries(files).forEach(([file, text]) => {
			write(source, join("skills", skill, file), text);
		});
	});
	git(source, "init", "--quiet");
	git(source, "add", "--all");
	git(source, "commit", "--quiet", "--allow-empty", "-m", "Guidance");
	return source;
}

function makeDirectory() {
	return mkdtempSync(join(tmpdir(), "guidance-test-"));
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
