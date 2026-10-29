#!/usr/bin/env node
// pr-tree.mjs — Print open PRs as a tree nested by base branch. Read-only.
//
// A label counts when its name starts with an emoji, so the icon comes from
// the label itself. Branch labels (feature, stacked) print after the state.

import {
	execGitHub,
	parseCommandLine,
	readPositionals,
	repoOption,
	resolveRepo,
} from "./gh-lib.mjs";

const MARKS = {
	MERGEABLE: ["●", "32"],
	CONFLICTING: ["✕", "31"],
};
const UNKNOWN_MARK = ["⭘", "2"];
const color = !process.env.NO_COLOR;

const USAGE = `Print open PRs as a tree nested by base branch.

Usage: pr-tree [--repo owner/name]

Leading mark: ● mergeable, ✕ conflicting, ⭘ unknown (coloured unless NO_COLOR
is set). PRs with no state label go on one "untracked" line at the end, author
in brackets.`;

const { values, positionals } = parseCommandLine(USAGE, { repo: repoOption });
readPositionals(positionals, { required: [] }, USAGE);
const repo = resolveRepo(values.repo);

const defaultBranch = execGitHub(
	["repo", "view", repo, "--json", "defaultBranchRef"],
	{ json: true },
).defaultBranchRef.name;
const all = execGitHub(
	[
		"pr",
		"list",
		"--repo",
		repo,
		"--state",
		"open",
		"--limit",
		"200",
		"--json",
		"number,title,baseRefName,headRefName,isDraft,labels,mergeable,author",
	],
	{ json: true },
);
const ours = all.filter(isTracked);
const untracked = all.filter((pr) => !isTracked(pr));

const heads = new Set(ours.map((pr) => pr.headRefName));
// A base that is neither the default branch nor an open PR's head gets a root
// of its own.
const roots = [
	defaultBranch,
	...new Set(
		ours
			.map((pr) => pr.baseRefName)
			.filter((base) => base !== defaultBranch && !heads.has(base)),
	),
];

roots.forEach((root) => {
	console.log(root);
	print(root, "");
});
if (untracked.length > 0) {
	const list = untracked
		.map((pr) => `#${pr.number} ${pr.headRefName} [${pr.author.login}]`)
		.join(", ");
	console.log(`\n${mark()} untracked: ${list}`);
}

function print(branch, prefix) {
	const siblings = ours.filter((pr) => pr.baseRefName === branch);
	siblings.forEach((pr, index) => {
		const last = index === siblings.length - 1;
		const labels = pr.labels.map((label) => label.name).filter(isEmojiLabel);
		const states = [
			...labels.filter((name) => !isBranchLabel(name)),
			...labels.filter(isBranchLabel),
			...(pr.isDraft ? ["📝 draft"] : []),
		].join(" · ");
		const lead = `${prefix}${last ? "└── " : "├── "}`;
		const name = `#${pr.number} ${pr.headRefName}`.padEnd(46 - lead.length);
		console.log(`${lead}${mark(pr.mergeable)} ${name} ${states}`.trimEnd());
		print(pr.headRefName, prefix + (last ? "    " : "│   "));
	});
}

function mark(mergeable) {
	const [glyph, code] = MARKS[mergeable] ?? UNKNOWN_MARK;
	return color ? `\x1b[${code}m${glyph}\x1b[0m` : glyph;
}

function isTracked(pr) {
	return pr.labels.some((label) => isEmojiLabel(label.name));
}

function isEmojiLabel(name) {
	return /^\p{Extended_Pictographic}/u.test(name);
}

function isBranchLabel(name) {
	return /^\P{L}+ (feature|stacked)$/u.test(name);
}
