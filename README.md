# Amader Mess Manager

Meal, bazar, rent and settlement accounting for shared houses ("messes"),
offered as a multi-tenant web app. Bengali and English UI, Firebase backend,
optional push reminders through a Cloudflare Worker.

## How tenancy works

- A **mess** is a tenant. Everything it owns (members, categories, months,
  meals, bazar, payments) lives under `messes/{messId}` in Firestore.
- A **person** signs in with Google once and gets a global account
  (`users/{uid}`). They can belong to several messes and switch between them
  at `/messes`.
- **Create a mess**: any signed-in user, from `/messes`. They become its
  owner and manager, the default cost categories and meal types are seeded,
  and a 10-character **join code** is generated.
- **Join a mess**: enter the join code at `/messes`. The rules verify the
  code and the seat limit. Managers can rotate the code and remove members.
- **Plans**: `free` (10 seats) or `pro` (100 seats). A **super admin** sets
  plans, seat limits and can suspend a mess (read-only) from `/super`.
  Payment-gateway billing is not wired yet; the plan field is where it plugs in.

## Setup

```sh
bun install
cp .env.example .env            # VAPID key + worker URL are optional
bun run dev
```

Hosting deploys automatically on every merge to `main`
(`.github/workflows/firebase-hosting-merge.yml`). Pull requests get a preview
channel.

### Deploying Firestore rules (manual)

The CI service account only has hosting permissions, so rules and indexes
are deployed by the project owner from their own machine. Run this once
after setting up, and again whenever `firestore.rules` or
`firestore.indexes.json` changes:

```sh
npx firebase-tools login          # once
npx firebase-tools deploy --only firestore
```

Deploy the rules **before** merging a change that depends on them, so the
live app never runs against older rules.

### Seeding & Administration

- **Seeding**: Creating a mess in the app automatically seeds its default cost categories and meal types using standard client Firestore.
- **Super Admin**: The first user to log in automatically becomes a platform administrator. Administrators can manage other admins and all messes directly from `/super`.
- **Legacy Migration**: Super admins can migrate existing single-tenant data directly in the browser from `/super` without needing any backend scripts or service accounts.
- **Testing**: Run `bun run test` to run unit tests.

## Push reminders

See `worker/README.md`. One Cloudflare Worker serves every mess.
