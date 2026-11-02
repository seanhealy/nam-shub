import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";

const SCRIPTS = join(import.meta.dirname, "../skills/manager-mode/scripts");
const SCRIPT = join(SCRIPTS, "pr-describe.ts");
const PR_TREE = join(SCRIPTS, "pr-tree.ts");

describe("pr-describe", () => {
	let pullRequests: PullRequest[];

	describe("with a Stack section already in the body", () => {
		beforeEach(() => {
			pullRequests = [
				buildPullRequest({
					number: 1,
					body: "Intro.\n\n<!-- pr-tree:start -->\n## Stack\n\nold tree\n<!-- pr-tree:end -->\n\nOutro.\n",
				}),
			];
		});

		it("replaces the section with what pr-tree --description prints", () => {
			const { writes } = runScript(pullRequests, ["1"]);

			assert.deepEqual(writes, [
				{
					pullRequestId: "PR_1",
					body: `Intro.\n\n${stackSection(pullRequests, 1)}\n\nOutro.\n`,
				},
			]);
		});

		it("says it updated the PR", () => {
			const { stdout } = runScript(pullRequests, ["1"]);

			assert.equal(stdout, "#1 updated\n");
		});
	});

	it("appends the section when the body has no markers", () => {
		pullRequests = [buildPullRequest({ number: 1, body: "Intro." })];

		const { writes } = runScript(pullRequests, ["1"]);

		assert.equal(writes[0].body, `Intro.\n\n${stackSection(pullRequests, 1)}`);
	});

	it("leaves every byte outside the markers as it was", () => {
		const before = "Line one  \r\n\r\n- item\t\r\n\r\n";
		const after = "\r\n\r\n<!-- other:start -->kept<!-- other:end -->  ";
		pullRequests = [
			buildPullRequest({
				number: 1,
				body: `${before}<!-- pr-tree:start -->stale<!-- pr-tree:end -->${after}`,
			}),
		];

		const { writes } = runScript(pullRequests, ["1"]);

		assert.equal(
			writes[0].body,
			`${before}${stackSection(pullRequests, 1)}${after}`,
		);
	});

	describe("when the section is already current", () => {
		beforeEach(() => {
			pullRequests = [buildPullRequest({ number: 1 })];
			pullRequests[0].body = `Intro.\n\n${stackSection(pullRequests, 1)}`;
		});

		it("doesn't write", () => {
			const { writes } = runScript(pullRequests, ["1"]);

			assert.deepEqual(writes, []);
		});

		it("says the PR is unchanged", () => {
			const { stdout } = runScript(pullRequests, ["1"]);

			assert.equal(stdout, "#1 unchanged\n");
		});
	});

	describe("with no PR numbers and a PR pr-tree can't place", () => {
		beforeEach(() => {
			pullRequests = [
				buildPullRequest({ number: 1, labels: ["bug"] }),
				buildPullRequest({ number: 2 }),
			];
		});

		it("skips it with a note and does every other open PR", () => {
			const { stdout } = runScript(pullRequests, []);

			assert.equal(
				stdout,
				"#1 skipped: not an open PR with an emoji label\n#2 updated\n",
			);
		});

		it("writes only the PRs it can place", () => {
			const { writes } = runScript(pullRequests, []);

			assert.deepEqual(
				writes.map((write) => write.pullRequestId),
				["PR_2"],
			);
		});
	});

	it("skips a PR that isn't open", () => {
		pullRequests = [buildPullRequest({ number: 1 })];

		const { stdout } = runScript(pullRequests, ["9"]);

		assert.equal(stdout, "#9 skipped: not an open PR with an emoji label\n");
	});

	describe("refusing writes", () => {
		it("refuses a mutation off the allowlist", () => {
			const result = runMutation(`
				mutation ($pullRequestId: ID!) {
					closePullRequest(input: { pullRequestId: $pullRequestId }) {
						clientMutationId
					}
				}`);

			assert.deepEqual(
				[result.status, result.stderr, result.calls],
				[1, "refusing mutation off the allowlist\n", []],
			);
		});

		it("refuses an updatePullRequest that sets more than the body", () => {
			const result = runMutation(`
				mutation ($pullRequestId: ID!, $body: String!) {
					updatePullRequest(
						input: { pullRequestId: $pullRequestId, body: $body, title: "x" }
					) {
						clientMutationId
					}
				}`);

			assert.deepEqual(
				[result.status, result.stderr, result.calls],
				[1, "refusing mutation that sets more than the body\n", []],
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
	body: string;
};

function buildPullRequest(
	overrides: Partial<Omit<PullRequest, "labels">> & { labels?: string[] },
): PullRequest {
	const { labels = ["🚧 working"], ...rest } = overrides;
	const number = rest.number ?? 1;
	return {
		number,
		url: `https://github.com/owner/repo/pull/${number}`,
		headRefName: `feat/pr-${number}`,
		baseRefName: "main",
		isDraft: false,
		mergeable: "MERGEABLE",
		author: { login: "someone" },
		body: "",
		...rest,
		labels: labels.map((name) => ({ name })),
	};
}

// The section pr-tree prints for the PR, against the same stand-in `gh`.
function stackSection(pullRequests: PullRequest[], number: number) {
	const bin = standInGitHub(pullRequests);
	return run(bin, [PR_TREE, "--repo", "owner/repo", "--description", `${number}`])
		.stdout.replace(/\n$/, "");
}

function runScript(pullRequests: PullRequest[], args: string[]) {
	const bin = standInGitHub(pullRequests);
	const result = run(bin, [SCRIPT, "--repo", "owner/repo", ...args]);
	const calls = readCalls(bin);
	const writes = calls
		.filter((call) => call.query.trim().startsWith("mutation"))
		.map(({ pullRequestId, body }) => ({ pullRequestId, body }));
	return { ...result, writes };
}

// Hands the query straight to the script's mutation runner.
function runMutation(query: string) {
	const bin = standInGitHub([]);
	const result = run(bin, [
		"--input-type=module",
		"--eval",
		`import { runMutation } from ${JSON.stringify(SCRIPT)};
		runMutation(process.argv[1], { pullRequestId: "PR_1", body: "Body." });`,
		query,
	]);
	return { ...result, calls: readCalls(bin) };
}

// A stand-in `gh` that answers with the PRs given and logs each GraphQL call's
// variables to calls.jsonl.
function standInGitHub(pullRequests: PullRequest[]) {
	const bin = mkdtempSync(join(tmpdir(), "nam-shub-test-"));
	writeFileSync(join(bin, "pull-requests.json"), JSON.stringify(pullRequests));
	writeFileSync(
		join(bin, "gh"),
		[
			"#!/usr/bin/env node",
			'const { appendFileSync, readFileSync } = require("node:fs");',
			"const args = process.argv.slice(2);",
			'const pullRequests = JSON.parse(readFileSync(`${__dirname}/pull-requests.json`, "utf8"));',
			"const variables = Object.fromEntries(",
			'\targs.filter((arg, index) => ["-f", "-F"].includes(args[index - 1]))',
			'\t\t.map((arg) => [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]),',
			");",
			"const answer = (data) => process.stdout.write(JSON.stringify(data));",
			'if (args[0] === "repo") {',
			'\tanswer({ defaultBranchRef: { name: "main" } });',
			'} else if (args[0] === "pr") {',
			"\tanswer(pullRequests);",
			"} else {",
			'\tappendFileSync(`${__dirname}/calls.jsonl`, JSON.stringify(variables) + "\\n");',
			'\tif (variables.query.trim().startsWith("mutation")) {',
			"\t\tanswer({ data: { updatePullRequest: { clientMutationId: null } } });",
			"\t} else {",
			"\t\tconst pullRequest = pullRequests.find((pr) => pr.number === Number(variables.number));",
			"\t\tanswer({ data: { repository: { pullRequest: { id: `PR_${pullRequest.number}`, body: pullRequest.body } } } });",
			"\t}",
			"}",
		].join("\n"),
	);
	chmodSync(join(bin, "gh"), 0o755);
	return bin;
}

function run(bin: string, args: string[]) {
	return spawnSync("node", args, {
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${bin}:${process.env.PATH}`,
			NO_COLOR: "1",
		},
	});
}

function readCalls(bin: string): Record<string, string>[] {
	const log = join(bin, "calls.jsonl");
	return existsSync(log)
		? readFileSync(log, "utf8")
				.trimEnd()
				.split("\n")
				.map((line) => JSON.parse(line))
		: [];
}
