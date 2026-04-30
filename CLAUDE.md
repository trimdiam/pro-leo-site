# St. Francis School — Claude Code Instructions

## Project Context
St. Francis De Sales Secondary School Student Management Application.
Tech Stack: HTML, CSS (Bento Grid, Glassmorphic UI), Vanilla JavaScript, Firebase v9+ (Auth & Firestore).

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

