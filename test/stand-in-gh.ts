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

export type PullRequest = {
	id: string;
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

export function buildPullRequest(
	overrides: Partial<Omit<PullRequest, "labels">> & { labels?: string[] },
): PullRequest {
	const { labels = ["🚧 working"], ...rest } = overrides;
	const number = rest.number ?? 1;
	return {
		id: `PR_${number}`,
		number,
		url: `https://github.com/owner/repo/pull/${number}`,
		headRefName: "feat/one",
		baseRefName: "main",
		isDraft: false,
		mergeable: "MERGEABLE",
		author: { login: "someone" },
		body: "",
		...rest,
		labels: labels.map((name) => ({ name })),
	};
}

// Runs node with a stand-in `gh` first on the PATH. It answers with the PRs
// given, and logs each call's command and variables for `calls`.
export function runWithStandInGitHub(
	pullRequests: PullRequest[],
	args: string[],
) {
	const bin = mkdtempSync(join(tmpdir(), "nam-shub-test-"));
	writeFileSync(join(bin, "pull-requests.json"), JSON.stringify(pullRequests));
	writeFileSync(join(bin, "gh"), STAND_IN_GH);
	chmodSync(join(bin, "gh"), 0o755);
	const result = spawnSync("node", args, {
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${bin}:${process.env.PATH}`,
			NO_COLOR: "1",
		},
	});
	return { ...result, calls: readCalls(bin) };
}

const STAND_IN_GH = [
	"#!/usr/bin/env node",
	'const { appendFileSync, readFileSync } = require("node:fs");',
	"const args = process.argv.slice(2);",
	'const pullRequests = JSON.parse(readFileSync(`${__dirname}/pull-requests.json`, "utf8"));',
	"const variables = Object.fromEntries(",
	'\targs.filter((arg, index) => ["-f", "-F"].includes(args[index - 1]))',
	'\t\t.map((arg) => [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]),',
	");",
	'const command = args.slice(0, 2).join(" ");',
	'appendFileSync(`${__dirname}/calls.jsonl`, JSON.stringify({ command, ...variables }) + "\\n");',
	"const answer = (data) => process.stdout.write(JSON.stringify(data));",
	'if (command === "repo view") {',
	'\tanswer({ defaultBranchRef: { name: "main" } });',
	'} else if (command === "pr list") {',
	"\tanswer(pullRequests);",
	"} else {",
	"\tanswer({ data: { updatePullRequest: { clientMutationId: null } } });",
	"}",
].join("\n");

function readCalls(bin: string): Record<string, string | undefined>[] {
	const log = join(bin, "calls.jsonl");
	return existsSync(log)
		? readFileSync(log, "utf8")
				.trimEnd()
				.split("\n")
				.map((line) => JSON.parse(line))
		: [];
}
