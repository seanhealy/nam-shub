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
	fail,
	parseCommandLine,
	parsePositiveInteger,
	repoOption,
	resolveRepo,
	runAllowedMutationAsync,
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
// Writes in flight at once, under GitHub's secondary rate limit.
const CONCURRENT_WRITES = 8;

const USAGE = `Write each PR's Stack section into its description (gated behind approval).

Usage: pr-describe [--repo owner/name] [--dry-run] [<pr> ...]

The section is what pr-tree --description prints. It replaces the text between
the pr-tree:start and pr-tree:end markers, or appends the section when they
aren't there, leaving the rest of the body as it was. With no PR numbers it
does every open PR. Prints one line per PR, in number order: updated,
unchanged, skipped or failed.

--dry-run prints what it would do and writes nothing.`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { values, positionals } = parseCommandLine(USAGE, {
		repo: repoOption,
		"dry-run": { type: "boolean" },
	});
	// Any number of PRs, so they don't fit readPositionals' fixed names.
	const numbers = positionals.map((pr) => parsePositiveInteger(pr, "pr"));
	const dryRun = values["dry-run"] ?? false;
	const pullRequests = readOpenPullRequests(resolveRepo(values.repo));
	const targets = [
		...new Set(numbers.length ? numbers : pullRequests.map((pr) => pr.number)),
	].sort((left, right) => left - right);
	const outcomes = await mapConcurrently(targets, CONCURRENT_WRITES, (number) =>
		writeStackSection(pullRequests, number, dryRun),
	);
	targets.forEach((number, index) => {
		console.log(`#${number} ${outcomes[index]}`);
	});
	if (outcomes.some((outcome) => outcome.startsWith("failed"))) {
		process.exitCode = 1;
	}
}

async function writeStackSection(
	pullRequests: PullRequest[],
	number: number,
	dryRun: boolean,
) {
	const section = stackSection(pullRequests, number);
	const pullRequest = pullRequests.find((pr) => pr.number === number);
	if (section === undefined || pullRequest === undefined) {
		return "skipped: not an open PR with an emoji label";
	}
	const next = withSection(pullRequest.body, section);
	if (next === pullRequest.body) {
		return "unchanged";
	}
	if (dryRun) {
		return "would update";
	}
	try {
		await updateBody(pullRequest.id, next);
	} catch (error) {
		return `failed: ${(error as Error).message}`;
	}
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

// Each item's task, at most `limit` running at once, results in item order.
async function mapConcurrently<Item, Result>(
	items: Item[],
	limit: number,
	task: (item: Item) => Promise<Result>,
) {
	const results: Result[] = [];
	let next = 0;
	async function work() {
		while (next < items.length) {
			const index = next++;
			results[index] = await task(items[index]);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, work),
	);
	return results;
}

// ── GitHub calls ─────────────────────────────────────────────────────────────

function updateBody(pullRequestId: string, body: string) {
	return runMutation(
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
	return runAllowedMutationAsync(query, variables, ALLOWED_MUTATIONS);
}
