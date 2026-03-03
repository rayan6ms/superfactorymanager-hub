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

### 1) Install dependencies

```bash
npm install
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

### 3) Run migrations

```bash
npx prisma migrate dev
```

### 4) Start the dev server

```bash
npm run dev
```

---

## Project structure (high level)

- `src/app/*` — routes, pages, API endpoints
- `src/components/*` — UI components (posts, editor, notifications, etc.)
- `src/lib/*` — server utilities (auth, db, posts, comments, notifications, sfm version fetchers, etc.)
- `src/generated/*` — generated SFML parser/lexer files used for editor diagnostics
- `prisma/schema.prisma` — database schema

---

## Third-party licenses / attribution

### SuperFactoryManager (TeamDman) — MPL-2.0

This project includes **generated SFML language tooling** derived from the upstream SuperFactoryManager project:

- Source: TeamDman/SuperFactoryManager (Minecraft mod + SFML language tooling)
- License: **Mozilla Public License 2.0 (MPL-2.0)**

The following paths in this repo are covered by MPL-2.0 (and remain under MPL-2.0):

- `src/generated/**` (ANTLR-generated lexer/parser/visitor/listener artifacts for SFML)
- `src/lib/syntax/sfml.tmLanguage.json` (SFML TextMate grammar, if derived from upstream)

If we modify any MPL-covered files above, the modified versions are also provided in source form in this repository under MPL-2.0, as required by the license.

See:

- `LICENSES/MPL-2.0.txt`
- `src/generated/NOTICE.md`

Upstream repository:

- [https://github.com/TeamDman/SuperFactoryManager](https://github.com/TeamDman/SuperFactoryManager)

> Note: The main SFMHub project is still licensed under the GPL-3.0 license.

---

## Security notes

- Remote profile images are validated to avoid private/local network fetches.
- Rate limits are enforced for posting, commenting, voting, and reporting.

---

## Contributing

Issues and PRs are welcome. Please keep licensing boundaries in mind:

- Do not copy MPL-covered code into non-MPL files unless you intend those files to become MPL-licensed.
- If you change files under `src/generated/**`, keep the MPL headers/notices intact and update `src/generated/NOTICE.md` if needed.

---

## License

GPLv3 (see [LICENSE](LICENSE))
