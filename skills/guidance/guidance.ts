import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const guidanceRepository = "https://github.com/seanhealy/nam-shub";
const blockPattern =
	/<!-- BEGIN:guidance@(\w+) -->[\s\S]*?<!-- END:guidance -->/;

export function syncGuidance(repository: string, source = guidanceRepository) {
	const checkout = mkdtempSync(join(tmpdir(), "guidance-"));
	try {
		execFileSync("git", ["clone", "--quiet", "--depth", "1", source, checkout]);
		const commit = execFileSync(
			"git",
			["-C", checkout, "rev-parse", "--short", "HEAD"],
			{ encoding: "utf8" },
		).trim();
		const core = readFileSync(join(checkout, "core.md"), "utf8");
		const previous = writeBlock(repository, core, commit);
		const skills = copySkills(
			join(checkout, "skills"),
			join(repository, ".claude", "skills"),
		);
		return { previous, commit, skills };
	} finally {
		rmSync(checkout, { recursive: true, force: true });
	}
}

function writeBlock(repository: string, core: string, commit: string) {
	const agents = join(repository, "AGENTS.md");
	const file = existsSync(agents) ? agents : join(repository, "CLAUDE.md");
	const current = existsSync(file) ? readFileSync(file, "utf8") : "";
	const block = `<!-- BEGIN:guidance@${commit} -->\n\n${core.trim()}\n\n<!-- END:guidance -->`;
	const previous = current.match(blockPattern)?.[1];
	const next = previous
		? current.replace(blockPattern, () => block)
		: `${`${block}\n\n${current}`.trimEnd()}\n`;
	writeFileSync(file, next);
	return previous;
}

function copySkills(from: string, to: string) {
	const names = readdirSync(from);
	names.forEach((name) => {
		rmSync(join(to, name), { recursive: true, force: true });
		cpSync(join(from, name), join(to, name), { recursive: true });
	});
	return names;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { previous, commit, skills } = syncGuidance(process.cwd());
	if (previous === commit) {
		console.log(`Shared guidance is already at ${commit}.`);
	} else if (previous) {
		console.log(`Updated shared guidance ${previous} → ${commit}.`);
		console.log(`Changes: ${guidanceRepository}/compare/${previous}...${commit}`);
	} else {
		console.log(`Added shared guidance @${commit}.`);
	}
	console.log(`Skills written: ${skills.join(", ")}`);
}
