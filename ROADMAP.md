# Roadmap

What is planned for agent-lens, roughly in priority order. The rule behind the
order: make the measurements true first, then build what nobody else does,
then grow reach.

`- [x]` shipped, `- [~]` in progress, `- [ ]` not started.

## Next

- [x] Web request detection: link screens to the server routes they call
      (`fetch('/api/...')` to Next.js, SvelteKit, Nuxt and Express routes), so
      the map and user journeys cross from front end to back end (0.4.0)
- [ ] Test with 3–5 non-technical builders: do they open the report a second
      time without being reminded, or just ask their agent? Do this before
      building much more.
- [ ] Show who ticked each plan step ("ticked by your agent" or "by you", from
      git history), now that agents maintain the plan
- [ ] "While you were away": compare this scan with the last one — steps
      finished, new blockers, where the effort went
- [ ] Decide what the Cost tab is for: `ccusage` already covers token
      tracking; consider one line on the Now tab and using cost as evidence for
      the going-in-circles check

## Later, if testing says so

- [ ] "What to ask your agent next": ready-to-paste prompts for blocked and
      pending steps
- [ ] A shareable report that hides file paths and costs, for a client or
      co-founder
- [ ] Progress history over weeks (a burn-down chart)
- [ ] Watch mode: refresh the report on every commit
- [ ] Map readability for big projects: group single-file modules, stop labels
      overlapping
- [ ] Agent integration beyond Claude Code: an MCP server, and rules for Cursor
      and Codex

## Coverage gaps

- [ ] Web requests from Python (Flask, FastAPI, Django) and Rails apps, and
      GraphQL / tRPC calls, which do not use URL paths
- [ ] Count Claude Code sessions run in git worktrees of the project
- [ ] Going-in-circles signals from Codex logs (today: Claude Code, plus git
      history and the plan for every agent)
- [ ] Codex adapter tested against more sessions and CLI versions
- [ ] Antigravity conversations that never link to a file in the project
- [ ] Regenerate the live demo in the publish workflow so its dates stay fresh

## Shipped

- [x] 0.3.0 — going-in-circles check; Claude Code plugin (`report`,
      `keep-plan`); `@/` shortcuts, `baseUrl` and monorepo packages on the
      map; plan-file change notice; no-test projects; secret redaction instead
      of skipping docs; report opens after a scan; live demo; automatic
      publishing; changelog
- [x] 0.2.6 — plan tip: suggested lines for `CLAUDE.md` / `AGENTS.md`
      (released within 0.3.0)
- [x] 0.2.4–0.2.5 — fixes from running on real projects; README screenshots
