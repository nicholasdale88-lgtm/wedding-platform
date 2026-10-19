# Start here: building with Claude Code

1. Unzip this folder somewhere, e.g. `~/Projects/wedding-platform`.
2. Install Claude Code if you don't have it. It's in the Claude desktop app (Code tab), or in a terminal: `npm install -g @anthropic-ai/claude-code`.
3. Open the folder in Claude Code and paste the prompt below as your first message.

---

## First prompt (copy everything in the box)

```
Read MASTER_BRIEF.md, CLAUDE.md, DESIGN_LOCK.md, CHANGES_SINCE_LAST_BRIEF.md and docs/01–09 first (docs/09 lists the systems the prototype only fakes: links, SMS automation, seating, photo/video uploads; build them for real, working on phone and desktop) (they override README.md where they differ). Then skim README.md for screen detail, and open design/ files only when building that screen.

We are building the product described in README.md: a multi-tenant wedding invitation and guest-management SaaS. Tenant #1 is Sophie & Nicholas (seed data comes from the prototypes). The HTML files are design references. The graphics are LOCKED: build every feature for real (admin, links, SMS automation, seating, photo/video uploads, customisation), but reproduce the visuals pixel-for-pixel. Never redesign.

Stack: Cloudflare free tier only (Workers + Hono, Pages + Vite React, D1 + Drizzle, R2, Cron). Total budget A$150 including Claude, so keep sessions focused.

Follow docs/06_MILESTONES.md one task per session, ticking tasks off and committing after each.

Before writing code for M1, give me a short plan, the schema, and the list of env vars I need to create.
```

---

## Accounts you'll need
- **Claude Pro** (includes Claude Code): about A$32/month.
- **Cloudflare**: free; buy the domain there at cost.
- **GitHub**: free.
- **Mobile Message**: SMS. Sign up only at M4, and buy credits within 30 days of signup for 1.6¢.
- **Stripe**: later, to sell; no monthly fee.
- **Resend**: later, for login emails; free tier.

Full A$150 breakdown: docs/01_STACK_AND_BUDGET.md
