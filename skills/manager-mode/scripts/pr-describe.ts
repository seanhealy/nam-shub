#!/usr/bin/env node
// pr-describe.ts: Write each PR's Stack section, the one `pr-tree
// --description` prints, into its description.
//
// It replaces only the text from `<!-- pr-tree:start -->` to
// `<!-- pr-tree:end -->`, or appends the section when the markers aren't there,
// so every other byte of the body stays as it was.
//
// Constrained by construction: the one write is a hardcoded `updatePullRequest`
// that sets the body and nothing else, checked against a local allowlist, with
// user input only ever filling variables. Because it writes to GitHub, keep it
// behind a permission prompt.

import { fileURLToPath } from "node:url";
import {
	execGitHub,
	fail,
	parseCommandLine,
	parsePositiveInteger,
	readPositionals,
	repoOption,
	resolveRepo,
	runAllowedMutation,
	splitRepo,
} from "./gh-lib.ts";
import {
	readOpenPullRequests,
	STACK_END,
	STACK_START,
	stackSection,
} from "./pr-tree.ts";

const ALLOWED_MUTATIONS = new Set(["updatePullRequest"]);
// The only input fields the write may set.
const ALLOWED_INPUT_FIELDS = ["pullRequestId", "body"];

const USAGE = `Write each PR's Stack section into its description (gated behind approval).

Usage: pr-describe [--repo owner/name] [<pr> ...]

The section is what pr-tree --description prints. It replaces the text between
the pr-tree:start and pr-tree:end markers, or appends the section when they
aren't there, leaving the rest of the body as it was. With no PR numbers it
does every open PR. Prints one line per PR: updated, unchanged or skipped.`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { values, positionals } = parseCommandLine(USAGE, {
		repo: repoOption,
	});
	const { prs } = readPositionals(
		positionals,
		{ required: [], variadic: "prs" },
		USAGE,
	);
	const numbers = prs.map((pr) => parsePositiveInteger(pr, "pr"));
	const repo = resolveRepo(values.repo);
	const pullRequests = readOpenPullRequests(repo);
	const targets = numbers.length
		? numbers
		: pullRequests.map((pr) => pr.number);
	targets.forEach((number) => {
		console.log(`#${number} ${describe(repo, pullRequests, number)}`);
	});
}

// Writes one PR's section and says what happened to it.
function describe(repo, pullRequests, number) {
	const section = stackSection(pullRequests, number);
	if (section === undefined) {
		return "skipped: not an open PR with an emoji label";
	}
	const { id, body } = readBody(repo, number);
	const next = withSection(body, section);
	if (next === body) {
		return "unchanged";
	}
	updateBody(id, next);
	return "updated";
}

export function withSection(body: string, section: string) {
	const start = body.indexOf(STACK_START);
	const end = body.indexOf(STACK_END, start);
	if (start === -1 || end === -1) {
		return body === "" ? section : `${body}\n\n${section}`;
	}
	return body.slice(0, start) + section + body.slice(end + STACK_END.length);
}

// ── GitHub calls ─────────────────────────────────────────────────────────────

// A read, so it goes straight to the shared runner (not the mutation
// allowlist).
function readBody(repo: string, number: number) {
	const [owner, name] = splitRepo(repo);
	const query = `
		query ($owner: String!, $name: String!, $number: Int!) {
			repository(owner: $owner, name: $name) {
				pullRequest(number: $number) { id body }
			}
		}`;
	return execGitHub(
		[
			"api",
			"graphql",
			"-f",
			`query=${query}`,
			"-f",
			`owner=${owner}`,
			"-f",
			`name=${name}`,
			"-F",
			`number=${number}`,
		],
		{ json: true },
	).data.repository.pullRequest;
}

function updateBody(pullRequestId: string, body: string) {
	runMutation(
		`
		mutation ($pullRequestId: ID!, $body: String!) {
			updatePullRequest(input: { pullRequestId: $pullRequestId, body: $body }) {
				clientMutationId
			}
		}`,
		{ pullRequestId, body },
	);
}

// The allowlist checks the mutation's name; this also checks it sets only the
// body, so an edit can't widen it to the title, base or state.
export function runMutation(query: string, variables: Record<string, string>) {
	const fields = [...query.matchAll(/input:\s*\{([^}]*)\}/g)].flatMap(
		(match) => [...match[1].matchAll(/(\w+)\s*:/g)].map((field) => field[1]),
	);
	if (
		fields.length !== ALLOWED_INPUT_FIELDS.length ||
		fields.some((field) => !ALLOWED_INPUT_FIELDS.includes(field))
	) {
		fail("refusing mutation that sets more than the body");
	}
	return runAllowedMutation(query, variables, ALLOWED_MUTATIONS);
}
