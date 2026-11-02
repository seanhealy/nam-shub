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
	repoOption,
	resolveRepo,
	runAllowedMutation,
	splitRepo,
} from "./gh-lib.ts";
import type { MutationVariables } from "./gh-lib.ts";
import type { PullRequest } from "./pr-tree.ts";
import {
	readOpenPullRequests,
	STACK_END,
	STACK_START,
	stackSection,
} from "./pr-tree.ts";

const ALLOWED_MUTATIONS = new Set(["updatePullRequest"]);
const ALLOWED_INPUT = "{ pullRequestId: $pullRequestId, body: $body }";

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
	// Any number of PRs, so they don't fit readPositionals' fixed names.
	const numbers = positionals.map((pr) => parsePositiveInteger(pr, "pr"));
	const repo = resolveRepo(values.repo);
	const pullRequests = readOpenPullRequests(repo);
	const targets = numbers.length
		? numbers
		: pullRequests.map((pr) => pr.number);
	targets.forEach((number) => {
		console.log(`#${number} ${writeStackSection(repo, pullRequests, number)}`);
	});
}

function writeStackSection(
	repo: string,
	pullRequests: PullRequest[],
	number: number,
) {
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

function withSection(body: string, section: string) {
	const end = body.indexOf(STACK_END);
	const start = body.lastIndexOf(STACK_START, end);
	if (end === -1 || start === -1) {
		return body === "" ? section : `${body}\n\n${section}`;
	}
	return body.slice(0, start) + section + body.slice(end + STACK_END.length);
}

// ── GitHub calls ─────────────────────────────────────────────────────────────

function readBody(repo: string, number: number) {
	const [owner, name] = splitRepo(repo);
	const query = `
		query ($owner: String!, $name: String!, $number: Int!) {
			repository(owner: $owner, name: $name) {
				pullRequest(number: $number) { id body }
			}
		}`;
	const response = execGitHub(
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
	) as {
		data: { repository: { pullRequest: { id: string; body: string } } };
	};
	return response.data.repository.pullRequest;
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

// The allowlist checks the mutation's name; this also checks that every input
// it sends is the body and nothing else, so an edit can't widen it to the
// title, base or state.
export function runMutation(query: string, variables: MutationVariables) {
	const inputs = [...query.matchAll(/\binput\s*:\s*([^)]*)/g)].map((match) =>
		match[1].replace(/\s+/g, " ").trim(),
	);
	if (!inputs.length || inputs.some((input) => input !== ALLOWED_INPUT)) {
		fail("refusing mutation that sets more than the body");
	}
	return runAllowedMutation(query, variables, ALLOWED_MUTATIONS);
}
