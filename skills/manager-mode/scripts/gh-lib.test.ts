import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const GH_LIB = join(import.meta.dirname, "gh-lib.ts");

describe("runAllowedMutation()", () => {
	const allowedMutations = ["addComment"];

	it("sends a mutation whose every call is on the allowlist", () => {
		const result = runWithFakeGitHub(
			`
			mutation ($subjectId: ID!, $body: String!) {
				addComment(input: { subjectId: $subjectId, body: $body }) {
					clientMutationId
				}
			}`,
			allowedMutations,
		);

		assert.deepEqual(result, { status: 0, stderr: "", called: true });
	});

	it("refuses a query that isn't a mutation", () => {
		const result = runWithFakeGitHub(
			`
			query ($owner: String!, $name: String!) {
				repository(owner: $owner, name: $name) { id }
			}`,
			allowedMutations,
		);

		assert.deepEqual(result, {
			status: 1,
			stderr: "refusing gh call that is not a mutation\n",
			called: false,
		});
	});

	it("refuses a mutation with no calls", () => {
		const result = runWithFakeGitHub("mutation { }", allowedMutations);

		assert.deepEqual(result, {
			status: 1,
			stderr: "refusing mutation off the allowlist\n",
			called: false,
		});
	});

	it("refuses a second call written with a space before the colon", () => {
		const result = runWithFakeGitHub(
			`
			mutation ($subjectId: ID!, $body: String!) {
				addComment(input: { subjectId: $subjectId, body: $body }) {
					clientMutationId
				}
				closePullRequest(input : { pullRequestId: $subjectId }) {
					clientMutationId
				}
			}`,
			allowedMutations,
		);

		assert.deepEqual(result, {
			status: 1,
			stderr: "refusing mutation off the allowlist\n",
			called: false,
		});
	});

	it("refuses an aliased second call", () => {
		const result = runWithFakeGitHub(
			`
			mutation ($subjectId: ID!, $body: String!) {
				addComment(input: { subjectId: $subjectId, body: $body }) {
					clientMutationId
				}
				comment: closePullRequest(input: { pullRequestId: $subjectId }) {
					clientMutationId
				}
			}`,
			allowedMutations,
		);

		assert.deepEqual(result, {
			status: 1,
			stderr: "refusing mutation off the allowlist\n",
			called: false,
		});
	});
});

function runWithFakeGitHub(query: string, allowedMutations: string[]) {
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
	const { status, stderr } = spawnSync(
		"node",
		[
			"--input-type=module",
			"--eval",
			`import { runAllowedMutation } from ${JSON.stringify(GH_LIB)};
			runAllowedMutation(process.argv[1], {}, new Set(JSON.parse(process.argv[2])));`,
			query,
			JSON.stringify(allowedMutations),
		],
		{
			encoding: "utf8",
			env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
		},
	);
	return { status, stderr, called: existsSync(join(bin, "called")) };
}
