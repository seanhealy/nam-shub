import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";

const SCRIPT = join(import.meta.dirname, "pr-tree.ts");

const LEGEND = [
	"● mergeable · ✕ conflicting · ⭘ unknown",
	"🚧 working · 🔍 self review · 🤔 needs decision · ⛔ blocked · 👀 review requested · ✅ approved · 🥞 stacked · 👣️ feature · 📝 draft",
];

describe("pr-tree", () => {
	let pullRequests: PullRequest[];

	describe("as a tree", () => {
		describe("with a stack that forks", () => {
			beforeEach(() => {
				pullRequests = [
					buildPullRequest({ number: 1, headRefName: "feat/base" }),
					buildPullRequest({
						number: 2,
						headRefName: "feat/left",
						baseRefName: "feat/base",
					}),
					buildPullRequest({
						number: 3,
						headRefName: "feat/right",
						baseRefName: "feat/base",
					}),
					buildPullRequest({ number: 4, headRefName: "fix/alone" }),
				];
			});

			it("draws each PR under its base with one-dash connectors", () => {
				assert.deepEqual(lines(runTree(pullRequests)).slice(0, 5), [
					"main",
					"├─ ● #1 feat/base                                🚧",
					"│  ├─ ● #2 feat/left                             🚧",
					"│  └─ ● #3 feat/right                            🚧",
					"└─ ● #4 fix/alone                                🚧",
				]);
			});
		});

		it("shows labels as their emoji, states before branch labels and then draft", () => {
			pullRequests = [
				buildPullRequest({
					number: 1,
					labels: ["🥞 stacked", "👀 review requested"],
					isDraft: true,
				}),
			];

			assert.equal(
				lines(runTree(pullRequests))[1],
				"└─ ● #1 feat/one                                 👀 🥞 📝",
			);
		});

		it("marks conflicting and unknown PRs", () => {
			pullRequests = [
				buildPullRequest({ number: 1, mergeable: "CONFLICTING" }),
				buildPullRequest({ number: 2, mergeable: "UNKNOWN" }),
			];

			assert.deepEqual(lines(runTree(pullRequests)).slice(1, 3), [
				"├─ ✕ #1 feat/one                                 🚧",
				"└─ ⭘ #2 feat/one                                 🚧",
			]);
		});

		it("lists PRs with no emoji label on the untracked line", () => {
			pullRequests = [
				buildPullRequest({ number: 1 }),
				buildPullRequest({
					number: 2,
					headRefName: "fix/theirs",
					labels: ["bug"],
				}),
			];

			assert.ok(
				lines(runTree(pullRequests)).includes(
					"⭘ untracked: #2 fix/theirs [someone]",
				),
			);
		});

		it("ends with a legend of every mark and label", () => {
			pullRequests = [buildPullRequest({ number: 1 })];

			assert.deepEqual(lines(runTree(pullRequests)).slice(-3), ["", ...LEGEND]);
		});
	});

	describe("with --description", () => {
		describe("with a PR in the middle of a forked stack", () => {
			beforeEach(() => {
				pullRequests = [
					buildPullRequest({ number: 1, headRefName: "feat/base" }),
					buildPullRequest({
						number: 2,
						headRefName: "feat/middle",
						baseRefName: "feat/base",
						labels: ["👀 review requested", "🥞 stacked"],
					}),
					buildPullRequest({
						number: 3,
						headRefName: "feat/sibling",
						baseRefName: "feat/base",
					}),
					buildPullRequest({
						number: 4,
						headRefName: "feat/left",
						baseRefName: "feat/middle",
					}),
					buildPullRequest({
						number: 5,
						headRefName: "feat/right",
						baseRefName: "feat/middle",
					}),
					buildPullRequest({ number: 6, headRefName: "fix/elsewhere" }),
				];
			});

			it("prints the PR's stack as a linked Stack section between the markers", () => {
				assert.equal(
					runDescription(pullRequests, 2),
					[
						"<!-- pr-tree:start -->",
						"## Stack",
						"",
						"<pre>",
						"main",
						'└─ ● <a href="https://github.com/owner/repo/pull/1">#1</a> feat/base                                🚧',
						'   └─ <b>● <a href="https://github.com/owner/repo/pull/2">#2</a> feat/middle                           👀 🥞  ◀ this PR</b>',
						'      ├─ ● <a href="https://github.com/owner/repo/pull/4">#4</a> feat/left                          🚧',
						'      └─ ● <a href="https://github.com/owner/repo/pull/5">#5</a> feat/right                         🚧',
						"</pre>",
						"",
						LEGEND[0],
						"",
						LEGEND[1],
						"<!-- pr-tree:end -->",
						"",
					].join("\n"),
				);
			});
		});

		it("escapes <, > and & in branch names", () => {
			pullRequests = [
				buildPullRequest({ number: 1, headRefName: "feat/<this>&that" }),
			];

			assert.match(
				runDescription(pullRequests, 1),
				/ feat\/&lt;this&gt;&amp;that /,
			);
		});

		it("fails for a PR that isn't open with an emoji label", () => {
			pullRequests = [buildPullRequest({ number: 1, labels: ["bug"] })];

			const result = runScript(pullRequests, ["--description", "1"]);

			assert.deepEqual(
				[result.status, result.stderr],
				[1, "#1 is not an open PR with an emoji label in owner/repo\n"],
			);
		});
	});
});

type PullRequest = {
	number: number;
	url: string;
	headRefName: string;
	baseRefName: string;
	labels: { name: string }[];
	isDraft: boolean;
	mergeable: string;
	author: { login: string };
};

function buildPullRequest(
	overrides: Partial<Omit<PullRequest, "labels">> & { labels?: string[] },
): PullRequest {
	const { labels = ["🚧 working"], ...rest } = overrides;
	const number = rest.number ?? 1;
	return {
		number,
		url: `https://github.com/owner/repo/pull/${number}`,
		headRefName: "feat/one",
		baseRefName: "main",
		isDraft: false,
		mergeable: "MERGEABLE",
		author: { login: "someone" },
		...rest,
		labels: labels.map((name) => ({ name })),
	};
}

function runTree(pullRequests: PullRequest[]) {
	return runScript(pullRequests, []).stdout;
}

function runDescription(pullRequests: PullRequest[], number: number) {
	return runScript(pullRequests, ["--description", String(number)]).stdout;
}

// Runs the script against a stand-in `gh` that answers with the PRs given.
function runScript(pullRequests: PullRequest[], args: string[]) {
	const bin = mkdtempSync(join(tmpdir(), "nam-shub-test-"));
	writeFileSync(join(bin, "pull-requests.json"), JSON.stringify(pullRequests));
	writeFileSync(
		join(bin, "gh"),
		[
			"#!/usr/bin/env node",
			'const { readFileSync } = require("node:fs");',
			'process.stdout.write(process.argv[2] === "repo"',
			'\t? JSON.stringify({ defaultBranchRef: { name: "main" } })',
			'\t: readFileSync(`${__dirname}/pull-requests.json`, "utf8"));',
		].join("\n"),
	);
	chmodSync(join(bin, "gh"), 0o755);
	return spawnSync("node", [SCRIPT, "--repo", "owner/repo", ...args], {
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${bin}:${process.env.PATH}`,
			NO_COLOR: "1",
		},
	});
}

function lines(output: string) {
	return output.trimEnd().split("\n");
}
