# Chatbot V3 Supervisor-Led Execution Baseline

Date: 2026-04-17
Scope: Chunk 0 execution residual for the supervisor-led cleanup line

## Pinned baseline

- Baseline branch: `feature/phase-2bc-chatbot-v3-exec`
- Worktree path: `medical-crm-v2/.worktrees/chatbot-v3-exec`
- Baseline commit: `ffcd822f69895012fdf941a1a75952838de215ab`
- Why selected: this is the most defensible local execution baseline because the branch reflog and commit graph show it was the immediate pre-implementation HEAD before the first supervisor-led implementation landing at `d7934f3e51928533aca692b9df61ff8056f683f4`. It therefore represents the execution starting point for this worktree before the supervisor-led authority runtime changes were landed.

## Baseline completeness validation

The pinned execution baseline is validated against the canonical shell-file set defined by `REQUIRED_SHELL_FILES` in `scripts/check-chatbot-v3-baseline-shell.mjs`.

That source-of-truth list currently covers the v3 route entrypoint, runtime shell, agent shell, supervisor service, orchestrator service, and shared chat validation schema for this execution branch.

Fail-fast guard:

- Script: `scripts/check-chatbot-v3-baseline-shell.mjs`
- CI-callable command: `pnpm check:chatbot-v3-baseline-shell`
- Normal automated path: `pnpm test`

## Review status snapshot

As of 2026-04-17 rerun:

- Chunk 0 residual (baseline artifact + fail-fast guard): `spec review APPROVED`, `quality review APPROVED`
- Chunk 8 residual (structured worker-task contract): `spec review APPROVED`, `quality review APPROVED`

Note: this snapshot only records baseline/residual closure. It does not replace the live supervisor-led implementation audit for runtime behavior findings.
