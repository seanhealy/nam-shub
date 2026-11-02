import assert from "node:assert/strict";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import type { PullRequest } from "./stand-in-gh.ts";
import { buildPullRequest, runWithStandInGitHub } from "./stand-in-gh.ts";

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

	it("writes just the section when the body is empty", () => {
		pullRequests = [buildPullRequest({ number: 1, body: "" })];

		const { writes } = runScript(pullRequests, ["1"]);

		assert.equal(writes[0].body, stackSection(pullRequests, 1));
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

	it("keeps the text after a start marker with no end marker of its own", () => {
		const before = "Intro <!-- pr-tree:start --> kept.\n\n";
		pullRequests = [
			buildPullRequest({
				number: 1,
				body: `${before}<!-- pr-tree:start -->stale<!-- pr-tree:end -->`,
			}),
		];

		const { writes } = runScript(pullRequests, ["1"]);

		assert.equal(writes[0].body, `${before}${stackSection(pullRequests, 1)}`);
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

	describe("with several PRs", () => {
		beforeEach(() => {
			pullRequests = [3, 1, 2].map((number) =>
				buildPullRequest({ number, headRefName: `feat/pr-${number}` }),
			);
		});

		it("fetches the open PRs once and reads nothing else", () => {
			const { calls } = runScript(pullRequests, []);

			assert.deepEqual(
				calls.map((call) => call.command),
				["pr list", "api graphql", "api graphql", "api graphql"],
			);
		});

		it("prints one line per PR in number order", () => {
			const { stdout } = runScript(pullRequests, ["3", "1", "2"]);

			assert.equal(stdout, "#1 updated\n#2 updated\n#3 updated\n");
		});
	});

	describe("with --dry-run", () => {
		beforeEach(() => {
			pullRequests = [buildPullRequest({ number: 1 })];
		});

		it("doesn't write", () => {
			const { writes } = runScript(pullRequests, ["--dry-run", "1"]);

			assert.deepEqual(writes, []);
		});

		it("says what it would do", () => {
			const { stdout } = runScript(pullRequests, ["--dry-run", "1"]);

			assert.equal(stdout, "#1 would update\n");
		});
	});

	it("skips a PR that isn't open", () => {
		pullRequests = [buildPullRequest({ number: 1 })];

		const { stdout } = runScript(pullRequests, ["9"]);

		assert.equal(stdout, "#9 skipped: not an open PR with an emoji label\n");
	});

	describe("runMutation()", () => {
		it("refuses a mutation off the allowlist", () => {
			const result = runMutation(`
				mutation ($pullRequestId: ID!, $body: String!) {
					closePullRequest(input: { pullRequestId: $pullRequestId, body: $body }) {
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

		it("refuses an updatePullRequest whose input is a variable", () => {
			const result = runMutation(`
				mutation ($input: UpdatePullRequestInput!) {
					updatePullRequest(input: $input) {
						clientMutationId
					}
				}`);

			assert.deepEqual(
				[result.status, result.stderr, result.calls],
				[1, "refusing mutation that sets more than the body\n", []],
			);
		});

		it("refuses an aliased second updatePullRequest that closes the PR", () => {
			const result = runMutation(`
				mutation ($pullRequestId: ID!, $body: String!) {
					updatePullRequest(input: { pullRequestId: $pullRequestId, body: $body }) {
						clientMutationId
					}
					close: updatePullRequest(
						input: { pullRequestId: $pullRequestId, state: CLOSED }
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

// The section pr-tree prints for the PR, against the same stand-in `gh`.
function stackSection(pullRequests: PullRequest[], number: number) {
	return runWithStandInGitHub(pullRequests, [
		PR_TREE,
		"--repo",
		"owner/repo",
		"--description",
		`${number}`,
	]).stdout.replace(/\n$/, "");
}

function runScript(pullRequests: PullRequest[], args: string[]) {
	const result = runWithStandInGitHub(pullRequests, [
		SCRIPT,
		"--repo",
		"owner/repo",
		...args,
	]);
	const writes = result.calls
		.filter((call) => call.query?.trim().startsWith("mutation"))
		.map(({ pullRequestId, body }) => ({ pullRequestId, body }));
	return { ...result, writes };
}

// Hands the query straight to the script's mutation runner.
function runMutation(query: string) {
	return runWithStandInGitHub(
		[],
		[
			"--input-type=module",
			"--eval",
			`import { runMutation } from ${JSON.stringify(SCRIPT)};
			runMutation(process.argv[1], { pullRequestId: "PR_1", body: "Body." });`,
			query,
		],
	);
}
