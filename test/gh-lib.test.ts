import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const GH_LIB = join(
	import.meta.dirname,
	"../skills/manager-mode/scripts/gh-lib.ts",
);

describe("runAllowedMutation()", () => {
	it("sends a mutation whose every call is on the allowlist", () => {
		const result = runAllowedMutation(`
			mutation ($subjectId: ID!, $body: String!) {
				addComment(input: { subjectId: $subjectId, body: $body }) {
					clientMutationId
				}
			}`);

		assert.deepEqual([result.status, result.called], [0, true]);
	});

	it("refuses a second call written with a space before the colon", () => {
		const result = runAllowedMutation(`
			mutation ($subjectId: ID!, $body: String!) {
				addComment(input: { subjectId: $subjectId, body: $body }) {
					clientMutationId
				}
				closePullRequest(input : { pullRequestId: $subjectId }) {
					clientMutationId
				}
			}`);

		assert.deepEqual(
			[result.status, result.stderr, result.called],
			[1, "refusing mutation off the allowlist\n", false],
		);
	});

	it("refuses an aliased second call", () => {
		const result = runAllowedMutation(`
			mutation ($subjectId: ID!, $body: String!) {
				addComment(input: { subjectId: $subjectId, body: $body }) {
					clientMutationId
				}
				comment: closePullRequest(input: { pullRequestId: $subjectId }) {
					clientMutationId
				}
			}`);

		assert.deepEqual(
			[result.status, result.stderr, result.called],
			[1, "refusing mutation off the allowlist\n", false],
		);
	});
});

// Runs the query through runAllowedMutation with only addComment allowed,
// against a stand-in `gh` that records whether it was called.
function runAllowedMutation(query: string) {
	const bin = mkdtempSync(join(tmpdir(), "nam-shub-test-"));
	writeFileSync(
		join(bin, "gh"),
		[
			"#!/usr/bin/env node",
			'require("node:fs").writeFileSync(`${__dirname}/called`, "");',
			'process.stdout.write("{}");',
		].join("\n"),
	);
	chmodSync(join(bin, "gh"), 0o755);
	const result = spawnSync(
		"node",
		[
			"--input-type=module",
			"--eval",
			`import { runAllowedMutation } from ${JSON.stringify(GH_LIB)};
			runAllowedMutation(process.argv[1], {}, new Set(["addComment"]));`,
			query,
		],
		{
			encoding: "utf8",
			env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
		},
	);
	return { ...result, called: existsSync(join(bin, "called")) };
}
