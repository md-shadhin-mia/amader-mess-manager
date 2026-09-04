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

### Seeding

Nothing to run: creating a mess in the app seeds its default cost
categories and meal types. `bun run seed --add-missing` is an optional local
tool for adding newly introduced defaults to existing messes.

## Scripts (firebase-admin, need a service account)

Set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json` or
`FIREBASE_SERVICE_ACCOUNT='{...}'` first.

| Command | What it does |
| --- | --- |
| `bun run seed [--add-missing] [--mess <id>]` | Optional: adds default categories and meal types to existing messes (idempotent). |
| `bun run migrate --name "My Mess" [--apply]` | Moves legacy single-tenant data into one mess. Dry-run by default. |
| `bun run super-admin --email a@b.com [--remove]` | Grants the `super_admin` claim. Sign out and in afterwards. |
| `bun run test` | Settlement, number and tenant unit tests. |

### Migrating an existing single-tenant install

1. Deploy the rules (`npx firebase-tools deploy --only firestore`); they keep
   the legacy top-level collections working alongside `messes/**`. Then merge
   so hosting deploys the new client.
2. Run `bun run migrate --name "Your Mess"` and check the counts, then
   `--apply`. The old manager becomes the owner; every user becomes a member.
3. Users sign in and land in the migrated mess. Re-run the script once to
   copy anything written in between (it is idempotent).
4. Later, delete the legacy top-level collections and remove the "Legacy"
   section from `firestore.rules`.

## Push reminders

See `worker/README.md`. One Cloudflare Worker serves every mess.
