// labels.mjs: The labels the PR scripts know, shared so pr-state sets the
// same names pr-tree explains. States come first in workflow order, then the
// branch labels; pr-tree's legend follows this order.

export const LABELS = {
	working: "🚧 working",
	selfReview: "🔍 self review",
	needsDecision: "🤔 needs decision",
	blocked: "⛔ blocked",
	reviewRequested: "👀 review requested",
	approved: "✅ approved",
	stacked: "🥞 stacked",
	// The variation selector after the footprints is part of the label's name.
	feature: "👣️ feature",
};
