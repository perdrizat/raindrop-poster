# Worklog

## 2026-04-01

**What changed:**
- Made Venice AI image generation lazy/on-demand — no longer auto-fires on mount, only triggers when user clicks the AI card
- Added `onActivate` prop to `ImageCard` component for click-to-generate behavior
- AI card now shows "Click to generate" placeholder and auto-selects when clicked
- Fixed 3 existing tests that assumed AI auto-generation on mount
- Added 5 new tests covering lazy-load behavior (no mount call, placeholder, spinner, auto-select, non-blocking publish)
- Updated CLAUDE.md to require red/green TDD for all changes

**Decisions & rationale:**
- Lazy AI generation to save Venice API credits — only generate when user explicitly wants it
- Auto-select AI option on click so user doesn't need to click twice (once to generate, once to select)

- Moved TDD and worklog-update instructions to global `~/.claude/CLAUDE.md` so they apply to all projects
- Removed duplicate TDD rule from project-level `raindrop/CLAUDE.md`

**Open threads:**
- Fill in remaining CLAUDE.md sections (build/test/deploy commands, architecture, key files)
