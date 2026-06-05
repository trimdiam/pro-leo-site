# St. Francis School — Claude Code Instructions

## Project Context
St. Francis De Sales Secondary School Student Management Application.
Tech Stack: HTML, CSS (Bento Grid, Glassmorphic UI), Vanilla JavaScript, Firebase v9+ (Auth & Firestore).

> Communication/advisor rules live in the machine-global `~/.claude/CLAUDE.md` — not duplicated here.

## Established Coding Rules & Constraints
1. **Modular Architecture:** Do not alter or interfere with the existing application routing logic.
2. **UI/UX Preservation:** Maintain the existing Bento Grid layout and glassmorphic CSS styling.

---

## Mobile Timeout Prevention

These rules are mandatory to prevent 'Stream idle timeout' errors on mobile environments.

1. **Chunk Your Code:** Never write or rewrite large files in a single response. Break implementations of over 100 lines into smaller chunks and ask for confirmation before continuing.

2. **Restrict Git Commands:** NEVER run `git diff` on the entire repository. Strictly use `git status`. If a diff is absolutely necessary, target a single file only (e.g., `git diff path/to/file`).

3. **Step-by-Step Execution:** For complex tasks, provide a brief numbered plan, execute ONLY step one, then wait for the user to say "continue" before proceeding.

4. **Concise Explanations:** Keep explanations brief and get straight to the tool use or code output.

---

## Task Delegation

When spawning subagents, use the cheapest model that can handle the task:
- Haiku: bulk mechanical tasks - no judgment needed
- Sonnet: scoped research, code exploration, synthesis
- Opus: only for real planning or tradeoff decisions

Spawn rules:
- Haiku cannot spawn subagents. If it needs to, return to parent.
- Max spawn depth: 2
- Subagents escalate to parent, never self-escalate model tier

## Preferred Tools
- Public pages → WebFetch (free, text-only)
- Dynamic pages / auth walls → agent-browser CLI
- PDFs → pdftotext (not Read tool)
- Repeated fetch patterns → wrap as reusable tool

---

## Context Memory Management

1. **80% Rule:** When context usage reaches ~80%, proactively run `/consolidate-memory` before continuing. Do not wait for the user to ask.

2. **Before compressing:** Always update memory files with any decisions, architectural changes, or pending work from the current session first. Never compress and lose context.

3. **What to save before compressing:**
   - Any new Firestore collections or schema changes
   - Any new Cloud Functions added or modified
   - Pending tasks / next steps explicitly mentioned by the user
   - Any bugs fixed with non-obvious root causes (so they aren't re-introduced)
   - Changes to auth, routing, or SW behaviour

4. **What NOT to save:** Completed one-off tasks with no lasting implication, generic code snippets re-findable in the codebase, anything already documented in a work log file in `pro-leo-site`.
