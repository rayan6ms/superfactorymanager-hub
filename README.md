# SFMHub

SFMHub is a community website for sharing, browsing, and discussing **Super Factory Manager (SFM)** programs (SFML code). It includes:

- A code editor experience for SFML (syntax highlighting + diagnostics / error highlighting)
- Posts with versions/tags/dependencies and rich descriptions
- Comments with voting and moderation tools
- User accounts (Credentials + optional Google/GitHub OAuth)
- Builds (public/private) with commit history
- Notifications (in-app + optional email)

Built with Next.js (App Router), Prisma/PostgreSQL, and NextAuth.

---

## Tech stack

- **Next.js** app router
- **Prisma** + **PostgreSQL**
- **NextAuth** (Credentials + optional Google/GitHub)
- **Vercel Blob** for image storage (optional)
- Email via **SMTP** (Nodemailer) for verification, password reset, and notifications

---

## Local development

Use Node 24.15+ (24 LTS) and Bun 1.4+. Dependencies are locked in `bun.lock`.
The project uses TypeScript 7 for the `tsc` CLI and Next.js builds. ESLint's
TypeScript parser still needs the TypeScript 6 compatibility API, so the lockfile
installs that API under the `typescript` package alias while `@typescript/native`
provides the TypeScript 7 CLI.

### 1) Install dependencies

```bash
bun install
```

### 2) Configure environment variables

Create `.env` with at least:

```bash
# Database
PRISMA_DATABASE_URL="postgresql://..."
POSTGRES_URL="postgresql://..."          # used as directUrl in schema.prisma

# Auth
AUTH_SECRET="a-long-random-secret"
ADMIN_EMAILS="you@example.com,other@example.com"

# App URL (used for absolute links in email)
APP_URL="http://localhost:3000"
# or NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Optional OAuth
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

# Optional email (verification / reset / notifications)
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_SECURE="false"
EMAIL_FROM="SFMHub <no-reply@yourdomain.tld>"

# Optional Vercel Blob (image uploads)
BLOB_READ_WRITE_TOKEN=""

# Production rate limiting
# Vercel deployments default to x-forwarded-for automatically.
# Other production hosts must set one of: cf-connecting-ip, x-forwarded-for, x-real-ip.
TRUSTED_PROXY_IP_HEADER=""
RATE_LIMIT_HASH_SECRET="a-long-random-secret"

# Optional debug
DEBUG_SFM="0"
```

### Vercel production database setup

The production errors `P1001: Can't reach database server` all point to one thing: the deployed app cannot open the database connection it was given.

This repo uses:

- `PRISMA_DATABASE_URL` for Prisma Client at runtime
- `POSTGRES_URL` for Prisma `directUrl` during migrations and other direct database operations

Use one production mode consistently:

```bash
# Option 1: direct TCP Postgres from Vercel
PRISMA_DATABASE_URL="postgresql://...?...sslmode=require"
POSTGRES_URL="postgresql://...?...sslmode=require"
```

```bash
# Option 2: Prisma Accelerate / Prisma Postgres HTTP
PRISMA_DATABASE_URL="prisma://..."            # or prisma+postgres://...
POSTGRES_URL="postgresql://...?...sslmode=require"
```

Notes:

- If you use the Vercel Prisma integration, it commonly injects `DATABASE_URL`. This project does not read that name by default, so copy the value into `PRISMA_DATABASE_URL` as well.
- If `PRISMA_DATABASE_URL` points at `*.prisma-data.net` over `postgres://` or `postgresql://`, include `sslmode=require`.
- `POSTGRES_URL` is still required even when runtime traffic goes through Accelerate, because Prisma CLI operations use `directUrl`.
- Production rate limiting needs the real client IP from a trusted edge proxy. On Vercel this app uses `x-forwarded-for` automatically. On other hosts, set `TRUSTED_PROXY_IP_HEADER` to the trusted header your proxy controls.

### 3) Run migrations

```bash
bunx prisma migrate dev
```

### 4) Start the dev server

```bash
bun run dev
```

---

## Project structure (high level)

- `src/app/*` — routes, pages, API endpoints
- `src/components/*` — UI components (posts, editor, notifications, etc.)
- `src/lib/*` — server utilities (auth, db, posts, comments, notifications, sfm version fetchers, etc.)
- `src/lib/sfml/*` — handwritten SFML lexer/parser, linter, and analysis worker used for editor diagnostics
- `prisma/schema.prisma` — database schema

## SFML tooling

`src/lib/sfml` contains the browser-native lexer/parser and warning analysis. Live diagnostics run in a cancellable worker; Monaco keeps the existing syntax colors. No database migration is required.

```bash
bun test
bun run typecheck
bun run lint
bun run build
bun run benchmark:sfml
```

The parser tests include legacy grammar results and all published guide examples. The preserved GitHub sign-in icon is licensed under ISC/MIT; see `src/components/icons/LICENSE.lucide`. SFML is the language of [TeamDman/SuperFactoryManager](https://github.com/TeamDman/SuperFactoryManager).

---

## Security notes

- Remote profile images are validated to avoid private/local network fetches.
- Rate limits are enforced for posting, commenting, voting, and reporting.

---

## Contributing

Issues and PRs are welcome.

---

## License

GPLv3 (see [LICENSE](LICENSE))
