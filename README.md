<div align="center">

# 🗂️ Overseer Hub

**One shared notebook for all your Claude projects.**

A remote MCP server on Cloudflare Workers that stores shared facts in D1, so a fact you give one project reaches the others without you copying it.

![Type](https://img.shields.io/badge/type-remote%20MCP%20server-d97757)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

## Why

Each claude.ai project keeps its own memory. When you tell one project a fact that another one needs, you end up repeating it. Overseer Hub is a small server that every project connects to as a custom connector. Projects read shared files at the start of each chat and write durable facts back, each with a reason.

- **Append-only log.** Every write is a new row in D1. Nothing is updated or deleted, and the database itself refuses to, so history and rollback come built in.
- **Namespaces with an access map.** Each project writes only to its own namespace and to `/shared`. Reads follow the same map.
- **Index files list their namespace.** Reading `/<namespace>/index.md` also lists every file in it, so a project can find a file nobody told it about.
- **No local hosting.** It runs on the Workers free plan and stays up when your PC is off.

```
 Duet (main chat)                     Finance project
      │ append /shared/bills.md            │ read /finance/index.md
      │ "reason: told in main chat"        │ read /shared/index.md → finds bills.md
      ▼                                    ▼
 ┌───────────────────────────────────────────────┐
 │ Overseer Hub (Cloudflare Worker, /mcp)        │
 │ sign-in: Workers OAuth Provider + Access      │
 │ rules: project, reason, path, namespace, line │
 └───────────────────────────────────────────────┘
                       │ INSERT only
                       ▼
          D1: log(id, ts, project, path, op, content, reason)
```

## 📦 Install

You need a Cloudflare account (free plan is enough) and Node.js. Sign-in goes through a Cloudflare Access for SaaS (OIDC) app, following Cloudflare's [`remote-mcp-cf-access`](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-cf-access) pattern.

```bash
npm install --legacy-peer-deps
npx wrangler login
npx wrangler d1 create overseer-hub          # put the id in wrangler.jsonc
npx wrangler kv namespace create OAUTH_KV    # put the id in wrangler.jsonc
npm run db:migrate:remote
npm run seed:remote
```

1. In `wrangler.jsonc`, set `MCP_RESOURCE` to `https://overseer-hub.<your-subdomain>.workers.dev/mcp`.
2. In Cloudflare One → Access → Applications, add a **SaaS** app:
   - Protocol: OIDC. Scopes: `openid email profile`. PKCE on.
   - Redirect URL: `https://overseer-hub.<your-subdomain>.workers.dev/callback`.
   - A policy that allows only your email.
3. The first deploy creates the Worker so secrets can be set. Use a copy of `wrangler.jsonc` without the `secrets` block:
   ```bash
   npx wrangler deploy -c wrangler.bootstrap.jsonc
   ```
4. Set the secrets. Each one prompts for its value. The Access values come from the SaaS app's page.
   ```bash
   npx wrangler secret put ACCESS_CLIENT_ID
   npx wrangler secret put ACCESS_CLIENT_SECRET
   npx wrangler secret put ACCESS_AUTHORIZATION_URL
   npx wrangler secret put ACCESS_TOKEN_URL
   npx wrangler secret put ACCESS_JWKS_URL
   npx wrangler secret put ALLOWED_EMAIL
   npx wrangler secret put COOKIE_ENCRYPTION_KEY   # any random 32-byte hex string
   ```
5. Deploy for real: `npx wrangler deploy`.

## 🚀 Usage

### Connect claude.ai

1. claude.ai → Customize → Connectors → **Add custom connector**. Name it `Overseer Hub`, URL `https://overseer-hub.<your-subdomain>.workers.dev/mcp`, and keep the default sign-in.
2. On the connector's page, set `read`, `append` and `changes` to **Always allow**.
3. In settings, keep **Connectors in new chats** on **At the start of every chat**.

Connectors are account-wide in claude.ai. Each project names itself on every call, and the server applies the access map. That guards against mistakes, not attackers.

### Tools

| Tool | Does |
|---|---|
| `read(project, path)` | Returns a file rebuilt from its rows, each line with its source and date. Index files also list the namespace's files. |
| `append(project, path, line, reason)` | Adds one line. Rejected with the name of the broken rule if it fails any check. |
| `changes(project, since)` | Rows after a row id or an ISO time, oldest first, limited to what the caller can read. Ends with a cursor to pass next time. |

### Write rules

Every `append` must pass all five, in order:

| Rule | Check |
|---|---|
| `project` | A known caller |
| `reason` | Present and not blank |
| `path` | `/<namespace>/<name>.md`, lowercase letters, digits and hyphens, in a namespace that exists |
| `namespace` | The caller's own namespace or `/shared` |
| `line` | One line, not blank, at most 2,000 characters |

### Project instruction block

Add this to each project's instructions, with its own name. Testing showed a softer version was skipped in 2 of 5 chats. This one was followed in 5 of 5.

> You are the `<project>` project. **Your first action in every chat, before writing anything, is to call the Overseer Hub `read` tool twice: `/<project>/index.md` and `/shared/index.md`, project `<project>`.** Do this even if the message looks unrelated or answerable from memory. It is not optional.
>
> The hub is where facts from other projects and Duet live. Before saying you don't know or don't have something (a date, a bill, a person, a plan), check the hub files listed in those indexes first.
>
> When you learn a durable fact another project or Duet may need, write it to the hub with `append` and a reason.

## Manage

### Add a project namespace

1. In `src/rules.ts`, add the namespace to `NAMESPACES` and the project to `ACCESS` with its `read` and `write` lists. Add it to the `read` list of any project that should see it.
2. In `src/seed-data.ts`, add a generic one-line description for its `index.md`.
3. Run the tests, deploy, then `npm run seed:remote`. The seed skips namespaces that already have an index.
4. Paste the instruction block above into the new project.

### Undo a line

There is no revert tool yet. Insert a revert row by hand. It cancels the row it names and keeps both in history:

```bash
npx wrangler d1 execute overseer-hub --remote --command "INSERT INTO log (ts, project, path, op, content, reason, reverts) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'owner', '/shared/<file>.md', 'revert', '', '<why>', <row id>)"
```

### Logs

`npx wrangler tail` shows each call's project, tool, path and outcome. Stored lines are never logged.

## ⚠️ Known gaps

- Caller identity is self-declared. Any chat with the connector can claim any project name.
- `search`, `write`, `stale`, a `revert` tool and `/_meta/access.yml` are not built yet.
- Dates in output use one fixed time zone (`DISPLAY_TZ` in `src/time.ts`). Storage is UTC.
- A Duet chat that was already open when a connector was added may not see it until its session restarts.
- `npm install` needs `--legacy-peer-deps` on npm 10.1.

## 🛠️ Development

```bash
npm test            # Vitest in the Workers runtime, against a local D1
npm run type-check
npm run dev         # local server on :8788 (needs a .dev.vars, see .dev.vars.example)
```

| File | Purpose |
|---|---|
| `src/index.ts` | Worker entry, OAuth provider and the three MCP tools |
| `src/rules.ts` | Namespaces, access map and write validation |
| `src/fold.ts` | Rebuilds a file from its rows |
| `src/tools/` | `read`, `append`, `changes` |
| `src/access-handler.ts`, `src/workers-oauth-utils.ts` | Sign-in through Cloudflare Access, adapted from Cloudflare's example (MIT) |
| `migrations/0001_log.sql` | The log table and its append-only triggers |
| `scripts/seed.ts` | Seeds each namespace's `index.md` |
| `test/` | Rules, fold, tools and the bills case, with made-up data only |

**No personal data goes in this repo.** Tests, fixtures and seed text are generic or made up. Secrets go in with `wrangler secret put`, local ones in `.dev.vars` (git-ignored). Real facts live only in D1.

## Contributing

Bug reports and ideas are welcome: open an issue. For a code change, fork the repo, make sure the tests and type-check pass, and open a pull request.

## License

[MIT](LICENSE)
