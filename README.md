# Shop Heroes Fusion Planner

Robust version scaffold for the Shop Heroes Fusion Planner.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: Postgres
- SQL toolkit: Knex

## Workspace Layout

- `apps/web`: React application
- `apps/api`: Node.js API
- `packages/database`: shared database config, migrations, and seeds
- `docs`: planning history and architectural decisions

## Getting Started

1. Copy `.env.example` to `.env`
2. Install dependencies:

```bash
npm install
```

3. Start the development servers:

```bash
npm run dev
```

4. Run database migrations:

```bash
npm run db:migrate
```

## Local Database

This project can use a dedicated database inside an existing local Postgres container.

Current local development defaults assume:

- host: `127.0.0.1`
- port: `54329`
- database: `shop_heroes_fusion_planner`
- user: `shop_heroes_planner`
- schema: `shop_heroes_planner`

## Scripts

- `npm run dev`: start API and web in parallel
- `npm run dev:api`: start API only
- `npm run dev:web`: start web only
- `npm run build`: build all workspaces
- `npm run db:migrate`: run knex migrations
- `npm run db:rollback`: rollback last knex batch
- `npm run db:seed`: run knex seeds

## Notes

- The database schema must come from `DB_SCHEMA`.
- Migrations and seeds must never target `public`.
- Planning history lives under `docs/`.
