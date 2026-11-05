import assert from "node:assert/strict";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import type { PullRequest } from "./pr-tree.ts";
import {
	buildPullRequest,
	runWithStandInGitHub,
} from "./stand-in-gh.test.support.ts";

const SCRIPT = join(import.meta.dirname, "pr-describe.ts");
const PR_TREE = join(import.meta.dirname, "pr-tree.ts");
const SKIPPED_MARKERS =
	"#1 skipped: the Stack markers don't make one section\n";

describe("pr-describe", () => {
	let pullRequests: PullRequest[];

	describe("with a Stack section already in the body", () => {
		beforeEach(() => {
			pullRequests = [
				buildPullRequest({
					number: 1,
					url: "https://github.com/owner/repo/pull/1",
					headRefName: "feat/one",
					labels: ["🚧 working"],
					body: "Intro.\n\n<!-- pr-tree:start -->\n## Stack\n\nold tree\n<!-- pr-tree:end -->\n\nOutro.\n",
				}),
			];
		});

		it("replaces the section with the PR's current stack", () => {
			const { writes } = runScript(pullRequests, ["1"]);

			assert.deepEqual(writes, [
				{
					pullRequestId: "PR_1",
					body: `Intro.

<!-- pr-tree:start -->
## Stack

<pre>
main
└─ <b>● <a href="https://github.com/owner/repo/pull/1">#1</a> feat/one                                 🚧  ◀ this PR</b>
</pre>

● mergeable · ✕ conflicting · ⭘ unknown

🚧 working · 🔍 self review · 🤔 needs decision · ⛔ blocked · 👀 review requested · ✅ approved · 🥞 stacked · 👣️ feature · 📝 draft
<!-- pr-tree:end -->

Outro.
`,
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

	it("leaves every byte outside the section as it was", () => {
		const before = "Line one  \r\n\r\n- item\t\r\n";
		const after = "\r\n\r\n<!-- other:start -->kept<!-- other:end -->  ";
		pullRequests = [
			buildPullRequest({
				number: 1,
				body: `${before}<!-- pr-tree:start -->\r\nstale\r\n<!-- pr-tree:end -->${after}`,
			}),
		];

		const { writes } = runScript(pullRequests, ["1"]);

		assert.equal(
			writes[0].body,
			`${before}${stackSection(pullRequests, 1)}${after}`,
		);
	});

	it("replaces a section whose marker lines are indented or end in spaces", () => {
		pullRequests = [
			buildPullRequest({
				number: 1,
				body: "Intro.\n  <!-- pr-tree:start -->\t\nstale\n<!-- pr-tree:end -->  \nOutro.",
			}),
		];

		const { writes } = runScript(pullRequests, ["1"]);

		assert.equal(
			writes[0].body,
			`Intro.\n${stackSection(pullRequests, 1)}\nOutro.`,
		);
	});

	it("appends the section after markers quoted in a sentence", () => {
		const sentence =
			"The section sits between `<!-- pr-tree:start -->` and `<!-- pr-tree:end -->`.";
		pullRequests = [buildPullRequest({ number: 1, body: sentence })];

		const { writes } = runScript(pullRequests, ["1"]);

		assert.equal(
			writes[0].body,
			`${sentence}\n\n${stackSection(pullRequests, 1)}`,
		);
	});

	describe("with two Stack sections", () => {
		beforeEach(() => {
			pullRequests = [
				buildPullRequest({
					number: 1,
					body: "<!-- pr-tree:start -->\none\n<!-- pr-tree:end -->\n\n<!-- pr-tree:start -->\ntwo\n<!-- pr-tree:end -->",
				}),
			];
		});

		it("skips the PR with a note and writes nothing", () => {
			const { stdout, writes } = runScript(pullRequests, ["1"]);

			assert.deepEqual(
				{ stdout, writes },
				{ stdout: SKIPPED_MARKERS, writes: [] },
			);
		});
	});

	describe("with an example section in a code block above the real one", () => {
		beforeEach(() => {
			pullRequests = [
				buildPullRequest({
					number: 1,
					body: "For example:\n\n```\n<!-- pr-tree:start -->\nexample\n<!-- pr-tree:end -->\n```\n\n<!-- pr-tree:start -->\nstale\n<!-- pr-tree:end -->",
				}),
			];
		});

		it("skips the PR with a note and writes nothing", () => {
			const { stdout, writes } = runScript(pullRequests, ["1"]);

			assert.deepEqual(
				{ stdout, writes },
				{ stdout: SKIPPED_MARKERS, writes: [] },
			);
		});
	});

	describe("with an end marker and no start marker", () => {
		beforeEach(() => {
			pullRequests = [
				buildPullRequest({ number: 1, body: "Intro.\n<!-- pr-tree:end -->" }),
			];
		});

		it("skips the PR with a note and writes nothing", () => {
			const { stdout, writes } = runScript(pullRequests, ["1"]);

			assert.deepEqual(
				{ stdout, writes },
				{ stdout: SKIPPED_MARKERS, writes: [] },
			);
		});
	});

	describe("with the end marker above the start marker", () => {
		beforeEach(() => {
			pullRequests = [
				buildPullRequest({
					number: 1,
					body: "<!-- pr-tree:end -->\nkept\n<!-- pr-tree:start -->",
				}),
			];
		});

		it("skips the PR with a note and writes nothing", () => {
			const { stdout, writes } = runScript(pullRequests, ["1"]);

			assert.deepEqual(
				{ stdout, writes },
				{ stdout: SKIPPED_MARKERS, writes: [] },
			);
		});
	});

	describe("with a start marker and no end marker of its own", () => {
		beforeEach(() => {
			pullRequests = [
				buildPullRequest({
					number: 1,
					body: "Intro.\n<!-- pr-tree:start -->\nkept\n\n<!-- pr-tree:start -->\nstale\n<!-- pr-tree:end -->",
				}),
			];
		});

		it("skips the PR with a note and writes nothing", () => {
			const { stdout, writes } = runScript(pullRequests, ["1"]);

			assert.deepEqual(
				{ stdout, writes },
				{ stdout: SKIPPED_MARKERS, writes: [] },
			);
		});
	});

	it("keeps an edit made to the body after the PRs were listed", () => {
		pullRequests = [buildPullRequest({ number: 1, body: "Intro." })];

		const { writes } = runScript(pullRequests, ["1"], {
			editedBodies: { 1: "Intro.\n\nA note added since." },
		});

		assert.equal(
			writes[0].body,
			`Intro.\n\nA note added since.\n\n${stackSection(pullRequests, 1)}`,
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

	describe("with several PRs", () => {
		beforeEach(() => {
			pullRequests = [3, 1, 2].map((number) =>
				buildPullRequest({ number, headRefName: `feat/pr-${number}` }),
			);
		});

		it("prints one line per PR in number order", () => {
			const { stdout } = runScript(pullRequests, ["3", "1", "2"]);

			assert.equal(stdout, "#1 updated\n#2 updated\n#3 updated\n");
		});

		it("stops at a write gh refuses, with gh's error", () => {
			const result = runScript(pullRequests, [], { refusedWrite: "PR_2" });

			assert.deepEqual(
				[result.status, result.stdout, result.stderr.includes("write refused")],
				[1, "#1 updated\n", true],
			);
		});
	});

	describe("with --dry-run", () => {
		beforeEach(() => {
			pullRequests = [buildPullRequest({ number: 1 })];
		});

		it("lists the open PRs and reads nothing else", () => {
			const { calls } = runScript(pullRequests, ["--dry-run", "1"]);

			assert.deepEqual(
				calls.map((call) => call.command),
				["pr list"],
			);
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

		it("refuses a second updatePullRequest with a comma before its colon", () => {
			const result = runMutation(`
				mutation ($pullRequestId: ID!, $body: String!) {
					updatePullRequest(input: { pullRequestId: $pullRequestId, body: $body }) {
						clientMutationId
					}
					close: updatePullRequest(
						input,: { pullRequestId: $pullRequestId, state: CLOSED }
					) {
						clientMutationId
					}
				}`);

			assert.deepEqual(
				[result.status, result.stderr, result.calls],
				[1, "refusing mutation that sets more than the body\n", []],
			);
		});

		it("refuses a second call to another mutation with a comma before its parenthesis", () => {
			const result = runMutation(`
				mutation ($pullRequestId: ID!, $body: String!) {
					updatePullRequest(input: { pullRequestId: $pullRequestId, body: $body }) {
						clientMutationId
					}
					r: addPullRequestReview,(input: { pullRequestId: $pullRequestId, body: $body }) {
						clientMutationId
					}
				}`);

			assert.deepEqual(
				[result.status, result.stderr, result.calls],
				[1, "refusing mutation off the allowlist\n", []],
			);
		});

		it("refuses a mutation with a # comment in it", () => {
			const result = runMutation(`
				mutation ($pullRequestId: ID!, $body: String!) {
					updatePullRequest(input: { pullRequestId: $pullRequestId, body: $body }) {
						clientMutationId
					}
					close: updatePullRequest(
						input # a comment
						: { pullRequestId: $pullRequestId, state: CLOSED }
					) {
						clientMutationId
					}
				}`);

			assert.deepEqual(
				[result.status, result.stderr, result.calls],
				[1, "refusing mutation with a comment\n", []],
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

function runScript(
	pullRequests: PullRequest[],
	args: string[],
	standIn?: Parameters<typeof runWithStandInGitHub>[2],
) {
	const result = runWithStandInGitHub(
		pullRequests,
		[SCRIPT, "--repo", "owner/repo", ...args],
		standIn,
	);
	const writes = result.calls
		.filter((call) => call.query?.trim().startsWith("mutation"))
		.map(({ pullRequestId, body }) => ({ pullRequestId, body }));
	return { ...result, writes };
}

// The script's own query is hardcoded and safe, so the guard is reached by
// handing runMutation, exported for this alone, a query written here.
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
