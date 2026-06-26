# AGENTS.md

- Keep this file small. Discover stack, scripts, layout, and dependencies from the repo when needed.
- In TypeScript source, local application imports use `@/` for `src/*` and keep `.js` specifiers because the package runs as ESM.
- CLI UX is correctness: long-running work needs visible progress, prompt cancellation/interrupts must exit cleanly, and user-facing errors should be actionable.

## Reviews

- Start with one short paragraph summarizing intent or follow-up delta.
- Group findings by `High`, `Medium`, and `Low`; include file references and concise impact.
- Re-audit prior findings in follow-ups and label each `Fixed`, `Partial`, or `Still open`.
- End with a summary table.

## Severity

- `High`: materially breaks command execution, safety, or operator trust.
- `Medium`: layering, error-handling, loading-state, or consistency issue that should be fixed before relying on the change.
- `Low`: minor maintainability, naming, output, or polish issue with limited immediate risk.
