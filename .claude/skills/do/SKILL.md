---
name: do
description: "Run a task in a specific mode: plan, edit, bypass, or ask. Usage: /do [mode] [task description]"
user-invokable: true
---

## Input Parsing

1. Check if the first word of the user's input matches one of: `plan`, `edit`, `bypass`, `ask`
2. If yes: that word is the **mode**, everything after it is the **task description**
3. If no: the entire input is the task description. Ask the user to choose a mode:
   - **plan** -- Research the codebase, create a plan, get approval before changing anything
   - **edit** -- Make code changes directly without extensive planning
   - **bypass** -- Auto-proceed without confirmations, just get it done
   - **ask** -- Ask clarifying questions first, gather requirements before acting

## Before Any Mode

Always do this first regardless of mode:

1. Read `CLAUDE.md` for project conventions and the WAT framework rules
2. Check `tools/` for existing Python scripts relevant to the task
3. Check `workflows/` for existing SOPs relevant to the task
4. Remember: use `py` to run Python, not `python` or `python3`
5. Follow all project conventions: SQLite for data, `.tmp/` for temp files, black-and-white UI, honeypot on forms

## Mode: plan

Research first, act second.

1. Explore the codebase: read relevant files, trace code paths, identify dependencies
2. Check `tools/` and `workflows/` for anything related to the task
3. Write a structured plan covering:
   - What changes are needed
   - Which files are affected
   - What order to make changes
   - Potential risks or side effects
4. Present the plan and **wait for explicit user approval**
5. After approval, execute step by step, reporting progress
6. If anything deviates from the plan, stop and re-confirm with the user

## Mode: edit

Direct execution with minimal overhead.

1. Read just enough context to understand the specific files involved
2. Make code changes directly -- no formal plan document
3. After each change, briefly state what was done and why
4. Run relevant tests or checks if they exist
5. Follow all project conventions from CLAUDE.md

## Mode: bypass

Full auto. No confirmations.

1. Parse the task, identify what needs doing, execute immediately
2. Do not ask for confirmation at any step
3. If ambiguity exists, pick the most sensible default and note the assumption made
4. Report a summary only when completely finished
5. Bypass means no confirmations -- it does NOT mean ignoring project conventions or standards

## Mode: ask

Gather requirements before touching anything.

1. Do not modify any code yet
2. Read relevant parts of the codebase to understand current state
3. Ask the user clarifying questions about: scope, constraints, preferences, edge cases, priority
4. Compile answers into a clear requirements summary
5. Present the summary and ask the user to confirm
6. Once confirmed, proceed with implementation (follow the edit mode behavior)

## Error Handling

Across all modes:

- If a script fails, read the full error and traceback, fix it, retest
- If paid API calls are involved, check with the user before retrying
- Document learnings in the relevant workflow when applicable
- Follow the WAT self-improvement loop: identify, fix, verify, update, move on

## Completion

When finished in any mode:

- State concisely what was accomplished
- If new tools were created in `tools/`, mention them
- If a workflow in `workflows/` should be created or updated, suggest it
