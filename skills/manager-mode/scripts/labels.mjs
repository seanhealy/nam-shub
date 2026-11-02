// labels.mjs: The labels the PR scripts know, shared so pr-state sets the
// same names pr-tree explains. Each has the colour (hex, no #) and description
// it was created with on GitHub. States come first in workflow order, then the
// branch labels; pr-tree's legend follows this order.

export const LABELS = {
	working: {
		name: "🚧 working",
		color: "FBCA04",
		description: "An agent or the manager is changing this PR",
	},
	selfReview: {
		name: "🔍 self review",
		color: "C5DEF5",
		description: "Reviews in progress before it goes to The Operator",
	},
	needsDecision: {
		name: "🤔 needs decision",
		color: "D876E3",
		description: "Waiting on a decision from The Operator",
	},
	blocked: {
		name: "⛔ blocked",
		color: "B60205",
		description: "Blocked on something outside this PR",
	},
	reviewRequested: {
		name: "👀 review requested",
		color: "0E8A16",
		description: "Ready for The Operator's review",
	},
	approved: {
		name: "✅ approved",
		color: "1D76DB",
		description: "Approved by The Operator",
	},
	stacked: {
		name: "🥞 stacked",
		color: "BFD4F2",
		description: "Based on another PR, not main",
	},
	feature: {
		// The variation selector after the footprints is part of the name.
		name: "👣️ feature",
		color: "EDEDED",
		description: "Head branch starts with feature/",
	},
};
