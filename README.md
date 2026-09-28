<p align="center">
  <img src="public/gig-logo.png" alt="GIG — Get In Git" height="80" />
</p>

<h1 align="center">GIG — Get In Git</h1>

<p align="center">
  <strong>A gig economy platform connecting developers with paid open-source tasks</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#project-structure">Project Structure</a> •
  <a href="#database">Database</a> •
  <a href="#testing">Testing</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

---

## What is GIG?

GIG is a platform that breaks developers out of tutorial purgatory by connecting them with curated engineering tasks from real open-source repositories and business backlogs. Developers claim scoped issues, submit pull requests through standard GitHub workflows, survive maintainer code review, and earn wallet bounties — building an inspectable, evidence-backed engineering record instead of a self-declared résumé.

**For Developers:** Discover tasks filtered by stack and difficulty, lock issues exclusively for 48 hours, submit real GitHub PRs, earn reputation, and withdraw earnings via UPI.

**For Businesses:** Publish engineering work from your backlogs, review PR submissions, approve contributions, and access a pool of verified talent.

> **Status:** Alpha v0.1 — Under active development. Not yet production-ready.

## Features

- **GitHub OAuth Authentication** — Sign in with GitHub, syncing profile data (bio, avatar, repos, followers)
- **Dual-Role System** — Separate dashboards and workflows for developers and businesses
- **Dual-Role GitHub Linking** — A single GitHub account can be linked to both a developer profile and a business profile; role resolution uses callback `mode` and `role` query hints
- **Issue Pool** — Browse curated tasks across opted-in repositories, filtered by technology and difficulty tier
- **Task Claiming** — Lock a task exclusively for 48 hours with single-claim enforcement
- **PR Submission & Review** — Submit GitHub pull request URLs; businesses review and approve/reject
- **Contribution Tracking** — Verified contributions linked to actual merged PRs
- **Wallet & Withdrawals** — Earned bounties tracked in an INR wallet with UPI withdrawal (₹500 minimum)
- **Reputation System** — 0–100 score derived from verified contributions
- **Row-Level Security** — Supabase RLS policies enforce data access at the database level
- **Legacy Demo Mode** — Local HMAC-based sessions for development without Supabase credentials

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **UI** | [React 19](https://react.dev/) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) |
| **Database** | [Supabase](https://supabase.com/) (PostgreSQL with RLS) |
| **Auth** | Supabase Auth + GitHub OAuth |
| **Testing** | [Vitest](https://vitest.dev/) |
| **Package Manager** | npm |
| **Deployment** | [Vercel](https://vercel.com/) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- npm 10+
- A [Supabase](https://supabase.com/) project (for production auth and database)

### Installation

```bash
# Clone the repository
git clone https://github.com/pranjal2410719/GIG.git
cd GIG

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
```

### Configuration

Edit `.env.local` with your credentials. See [`.env.example`](.env.example) for all available variables.

**Required for Supabase auth:**
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/publishable key (browser-safe, RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, bypasses RLS) |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` (exposed to client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` (exposed to client) |
| `SESSION_SECRET` | HMAC session signing secret — generate with `openssl rand -base64 32` |

**Optional for local development without Supabase:**
| Variable | Description |
|----------|-------------|
| `ENABLE_LEGACY_SESSION` | Set `"true"` to enable local demo login (never honored in production) |
| `TEST_DEV_EMAIL` / `TEST_DEV_PASSWORD` | Demo developer credentials |
| `TEST_BIZ_EMAIL` / `TEST_BIZ_PASSWORD` | Demo business credentials |

### Database Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the migrations in the Supabase SQL Editor, in order:

```sql
-- 1. supabase/migrations/0000_init.sql          (tables + base RLS)
-- 2. supabase/migrations/0001_github_profile.sql (GitHub profile columns)
-- 3. supabase/migrations/0002_rls_integrity.sql  (RLS lockdown + unique constraints)
-- 4. supabase/migrations/0003_rls_privilege_lockdown.sql (privilege hardening)
-- 5. supabase/migrations/0004_wallet_tx_nullable_task.sql (withdrawal support)
-- 6. supabase/migrations/0013_dual_role_github.sql (dual-role GitHub linking: drops UNIQUE on github_id, adds indexes)
```

Or push via the Supabase CLI:

```bash
npm run db:push
```

3. Seed the database with demo data:

```bash
npm run seed
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

### GitHub OAuth Setup

1. Enable **GitHub** under **Authentication → Providers** in your Supabase dashboard
2. Configure the OAuth callback URL to match your `NEXT_PUBLIC_BASE_URL` (e.g., `http://localhost:3000`)
3. Users can sign in with GitHub on the auth page, or connect their GitHub account from the developer dashboard

> If Supabase is not configured and `ENABLE_LEGACY_SESSION=true`, the app falls back to local demo login (`dev@gig.dev` / `biz@gig.dev`). This fallback is hard-disabled in production.

## Project Structure

```
├── app/
│   ├── (marketing)/          # Landing page (route group)
│   ├── actions/              # Server actions (auth, dev-loop, business-loop)
│   ├── api/                  # API routes (auth, profile, tasks, wallet)
│   ├── auth/                 # Auth pages (business, developer)
│   ├── dashboard/            # Dashboard pages (business, developer)
│   ├── globals.css           # Global styles
│   └── layout.tsx            # Root layout
├── components/
│   ├── dashboard/            # Dashboard-specific components
│   └── *.tsx                 # Shared components (Navbar, Footer, AuthForm, etc.)
├── lib/
│   ├── db-operations.ts      # Database CRUD operations
│   ├── session.ts            # Session management (Supabase + legacy HMAC)
│   ├── session-token.ts      # HMAC token signing/verification
│   ├── supabaseClient.ts     # Supabase client initialization
│   ├── supabaseAuth.ts       # Supabase auth operations
│   ├── dashboard-data.ts     # Dashboard data aggregation
│   ├── dashboard-stats-defaults.ts  # Default/fallback dashboard stats
│   └── seed.ts               # Database seeding script
├── public/                   # Static assets (logo)
├── supabase/
│   ├── config.toml           # Supabase CLI config
│   └── migrations/           # SQL migration files (6 migrations)
├── tests/                    # Vitest test files
├── proxy.ts                  # Next.js 16 proxy (session refresh middleware)
└── package.json
```

## Database

GIG uses Supabase PostgreSQL with Row-Level Security. The schema includes:

| Table | Purpose |
|-------|---------|
| `users` | User profiles linked to `auth.users` via FK |
| `repositories` | GitHub repositories opted in to the platform |
| `tasks` | Bounty tasks tied to repositories |
| `claims` | Developer task claims (48h exclusive lock) |
| `submissions` | PR submissions for claimed tasks |
| `contributions` | Verified contributions (post-merge) |
| `wallets` | User wallet balances |
| `wallet_transactions` | Transaction ledger (credits, withdrawals) |

All tables have RLS enabled with policies scoped to `auth.uid()`. Privilege escalation is prevented by revoking mutation access to sensitive columns (role, wallet balances) from authenticated users.

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/github` | Initiate GitHub OAuth flow (supports `mode=login|link` and `role=developer|business` query params) |
| `GET` | `/api/auth/github/callback` | Handle OAuth callback; preserves existing session in link mode, resolves role from hint or existing profile |
| `PATCH` | `/api/profile` | Update user profile |
| `POST` | `/api/tasks` | Create a new task (business only) |
| `GET` | `/api/wallet` | Get wallet balance & transactions |
| `POST` | `/api/wallet/withdrawal` | Initiate UPI withdrawal (≥₹500) |

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npx vitest
```

The test suite covers:

- **Session token security** — HMAC signing/verification, tamper detection, expiry, production secret enforcement, legacy session gating
- **Withdrawal system** — Balance validation, insufficient funds, wallet not found, API endpoint auth/validation
- **GitHub profile sync** — `cleanGithubHandle` validation, `syncGithubProfile` authenticated/public endpoints, `upsertUser` sanitization
- **Dual-role GitHub linking** — `getUserByGithubId` with role filter, link mode role preservation, login mode role hint resolution, dual-role coexistence

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest test suite |
| `npm run seed` | Seed database with demo data |
| `npm run db:push` | Push migrations to Supabase |

## Deployment

The application is designed for deployment on [Vercel](https://vercel.com/):

1. Connect your GitHub repository to Vercel
2. Set all required environment variables in the Vercel dashboard
3. Ensure `SESSION_SECRET` is set to a strong, unique value (the app refuses to start with the default in production)
4. Deploy

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## Security

See [SECURITY.md](SECURITY.md) for our security policy and how to report vulnerabilities.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.