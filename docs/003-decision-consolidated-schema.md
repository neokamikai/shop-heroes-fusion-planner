# Shop Heroes Planner - Consolidated Schema Decision

## Document Purpose

This document is the current consolidated decision based on:

- `001-discovery-initial-schema-plan.md`
- `002-review-dd-notes.md`

It represents the schema direction we should treat as the active source of truth before implementation starts.

## Stack Decision

- Frontend: `React`
- Backend: `Node.js`
- Database: `Postgres`
- SQL toolkit: `Knex`
- Custom database schema via env var
- Do not use `public`

## Environment

Suggested environment variables:

```env
DB_HOST=
DB_PORT=5432
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_SCHEMA=shop_heroes_planner
```

Rules:

- database name must come from env
- schema name must come from env
- migrations and seeds must explicitly target the configured schema

## Core Domain Separation

Global data:

- taxonomy
- tiers
- item catalog
- character catalog
- character equipment affinities
- setting definitions

Per-user/per-account data:

- users
- auth identities
- game accounts
- account settings
- account character states
- account item states
- account inventory
- account targets
- account crafts
- account fusions

## Business Decisions Locked For Now

- character affinities are global and immutable
- character unlock state is per account
- character level is per account
- item blueprint ownership is per account
- item craft unlocked state is per account
- items are seeded globally
- characters are seeded globally
- there is no end-user feature to create characters
- `Load Ripped Catalog` does not exist in the robust version
- `PvP` is a first-class category in taxonomy
- affinity is still shared by subcategory, even when `PvP` reuses subcategory names like `Axe` or `Staff`
- completed or cancelled fusions should be deleted, not historically stored
- tiers must not be plain text references in relational tables

## Tables

### `users`

Purpose:

- application users

Columns:

- `id` uuid pk
- `display_name` text not null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Notes:

- do not overfit authentication directly into this table
- keep this table focused on the user entity itself

### `user_auth_identities`

Purpose:

- support login providers like Google, Steam, Facebook and others

Columns:

- `id` uuid pk
- `user_id` uuid not null fk -> `users.id`
- `provider` text not null
- `provider_user_id` text not null
- `provider_email` text null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Constraints:

- unique `(provider, provider_user_id)`

### `game_accounts`

Purpose:

- a user may manage multiple Shop Heroes accounts

Columns:

- `id` uuid pk
- `user_id` uuid not null fk -> `users.id`
- `name` text not null
- `platform` text not null
- `notes` text null
- `is_active` boolean not null default true
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Examples for `platform`:

- `steam`
- `mobile`
- `pc-non-steam`

### `catalog_categories`

Purpose:

- global top-level taxonomy for items

Columns:

- `id` uuid pk
- `code` text unique not null
- `name` text unique not null
- `sort_order` integer not null default 0
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Initial categories:

- `weapon`
- `pvp`
- `protective`
- `support_accessory`
- `trinket_accessory`

### `catalog_subcategories`

Purpose:

- global item subcategories

Columns:

- `id` uuid pk
- `category_id` uuid not null fk -> `catalog_categories.id`
- `code` text not null
- `name` text not null
- `sort_order` integer not null default 0
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Constraints:

- unique `(category_id, code)`
- unique `(category_id, name)`

### `catalog_tiers`

Purpose:

- normalized quality tiers used across items, inventory, targets, crafts and fusions

Columns:

- `id` uuid pk
- `code` text unique not null
- `name` text unique not null
- `sort_order` integer not null
- `value_multiplier` integer not null
- `previous_tier_count_required` integer not null default 0
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Initial tiers:

- `common`
- `good`
- `great`
- `flawless`
- `epic`
- `legendary`
- `mythical`

### `catalog_items`

Purpose:

- global item definitions

Columns:

- `id` uuid pk
- `external_slug` text unique not null
- `name` text not null
- `subcategory_id` uuid not null fk -> `catalog_subcategories.id`
- `level` integer not null
- `min_tier_id` uuid not null fk -> `catalog_tiers.id`
- `icon_url` text null
- `blueprint_url` text null
- `summary` text null
- `source` text not null default `'seed'`
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Notes:

- category is derived through subcategory
- tier is normalized now, not stored as plain text

### `catalog_characters`

Purpose:

- global character definitions

Columns:

- `id` uuid pk
- `code` text unique not null
- `name` text unique not null
- `sort_order` integer not null default 0
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

### `catalog_character_affinities`

Purpose:

- immutable global affinity rules between characters and equipment subcategories

Columns:

- `id` uuid pk
- `character_id` uuid not null fk -> `catalog_characters.id`
- `subcategory_id` uuid not null fk -> `catalog_subcategories.id`
- `affinity_level` text not null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Constraints:

- unique `(character_id, subcategory_id)`

Initial affinity values:

- `Poor`
- `Normal`
- `Optimal`

### `catalog_setting_definitions`

Purpose:

- define available account-level settings and their defaults

Columns:

- `id` uuid pk
- `key` text unique not null
- `value_type` text not null
- `default_value` text null
- `description` text null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

### `account_settings`

Purpose:

- flexible key/value settings for a specific game account

Columns:

- `id` uuid pk
- `account_id` uuid not null fk -> `game_accounts.id`
- `setting_definition_id` uuid not null fk -> `catalog_setting_definitions.id`
- `setting_value` text null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Constraints:

- unique `(account_id, setting_definition_id)`

### `account_character_states`

Purpose:

- unlocked state and level of each character in one game account

Columns:

- `id` uuid pk
- `account_id` uuid not null fk -> `game_accounts.id`
- `character_id` uuid not null fk -> `catalog_characters.id`
- `is_unlocked` boolean not null default false
- `level` integer not null default 1
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Constraints:

- unique `(account_id, character_id)`

Future note:

- if we later decide to persist equipped items per character, this table remains a good anchor point for that extension

### `account_item_states`

Purpose:

- per-account item unlock and blueprint state

Columns:

- `id` uuid pk
- `account_id` uuid not null fk -> `game_accounts.id`
- `item_id` uuid not null fk -> `catalog_items.id`
- `owned_blueprint` boolean not null default false
- `craft_unlocked` boolean not null default false
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Constraints:

- unique `(account_id, item_id)`

### `account_inventory_items`

Purpose:

- inventory quantities per account, item and tier

Columns:

- `id` uuid pk
- `account_id` uuid not null fk -> `game_accounts.id`
- `item_id` uuid not null fk -> `catalog_items.id`
- `tier_id` uuid not null fk -> `catalog_tiers.id`
- `quantity` integer not null default 0
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Constraints:

- unique `(account_id, item_id, tier_id)`

### `account_targets`

Purpose:

- planner targets for a character in a specific account

Columns:

- `id` uuid pk
- `account_id` uuid not null fk -> `game_accounts.id`
- `character_id` uuid not null fk -> `catalog_characters.id`
- `item_id` uuid not null fk -> `catalog_items.id`
- `target_tier_id` uuid not null fk -> `catalog_tiers.id`
- `quantity` integer not null default 1
- `priority` integer not null
- `is_completed` boolean not null default false
- `completed_at` timestamptz null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Constraints:

- unique `(account_id, item_id, target_tier_id, priority)`

### `account_crafts`

Purpose:

- active crafts being tracked by the planner

Columns:

- `id` uuid pk
- `account_id` uuid not null fk -> `game_accounts.id`
- `item_id` uuid not null fk -> `catalog_items.id`
- `target_id` uuid null fk -> `account_targets.id`
- `character_id` uuid null fk -> `catalog_characters.id`
- `planned_target_tier_id` uuid not null fk -> `catalog_tiers.id`
- `base_tier_id` uuid not null fk -> `catalog_tiers.id`
- `source` text not null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Suggested values for `source`:

- `target`
- `catalog`
- `manual`

Note:

- if completed and cancelled crafts should also be ephemeral later, we can simplify this table further
- for now, only fusion deletion behavior is locked

### `account_fusions`

Purpose:

- active fusion queue entries

Columns:

- `id` uuid pk
- `account_id` uuid not null fk -> `game_accounts.id`
- `item_id` uuid not null fk -> `catalog_items.id`
- `from_tier_id` uuid not null fk -> `catalog_tiers.id`
- `to_tier_id` uuid not null fk -> `catalog_tiers.id`
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Behavior:

- completed fusion should delete the row
- cancelled fusion should delete the row

## Migration Sequence

Rule:

- one migration per `CREATE` statement

Suggested order:

1. `create_app_schema`
2. `create_users_table`
3. `create_user_auth_identities_table`
4. `create_game_accounts_table`
5. `create_catalog_categories_table`
6. `create_catalog_subcategories_table`
7. `create_catalog_tiers_table`
8. `create_catalog_items_table`
9. `create_catalog_characters_table`
10. `create_catalog_character_affinities_table`
11. `create_catalog_setting_definitions_table`
12. `create_account_settings_table`
13. `create_account_character_states_table`
14. `create_account_item_states_table`
15. `create_account_inventory_items_table`
16. `create_account_targets_table`
17. `create_account_crafts_table`
18. `create_account_fusions_table`

Suggested file naming:

```text
202606260001_create_app_schema.js
202606260002_create_users_table.js
202606260003_create_user_auth_identities_table.js
202606260004_create_game_accounts_table.js
202606260005_create_catalog_categories_table.js
202606260006_create_catalog_subcategories_table.js
202606260007_create_catalog_tiers_table.js
202606260008_create_catalog_items_table.js
202606260009_create_catalog_characters_table.js
202606260010_create_catalog_character_affinities_table.js
202606260011_create_catalog_setting_definitions_table.js
202606260012_create_account_settings_table.js
202606260013_create_account_character_states_table.js
202606260014_create_account_item_states_table.js
202606260015_create_account_inventory_items_table.js
202606260016_create_account_targets_table.js
202606260017_create_account_crafts_table.js
202606260018_create_account_fusions_table.js
```

## Seed Sequence

Rule:

- one seed per global data type

Suggested order:

1. `catalog_taxonomy`
2. `catalog_tiers`
3. `catalog_items`
4. `catalog_characters`
5. `catalog_character_affinities`
6. `catalog_setting_definitions`

Suggested file naming:

```text
001_catalog_taxonomy.js
002_catalog_tiers.js
003_catalog_items.js
004_catalog_characters.js
005_catalog_character_affinities.js
006_catalog_setting_definitions.js
```

### `001_catalog_taxonomy`

Creates:

- categories
- subcategories linked to categories

### `002_catalog_tiers`

Creates:

- the global quality tier definitions

### `003_catalog_items`

Uses:

- `__ripped/shop-heroes-items.json`

Must resolve:

- `category` -> `catalog_categories.id`
- `subcategory` -> `catalog_subcategories.id`
- `min_tier` -> `catalog_tiers.id`

### `004_catalog_characters`

Creates:

- global character catalog

### `005_catalog_character_affinities`

Creates:

- immutable character affinity rules

### `006_catalog_setting_definitions`

Creates:

- known setting keys and defaults such as craft slot count

## Explicitly Deferred

These are intentionally not part of the first schema baseline:

- bug report / feature request module
- webmaster dashboard
- separate admin project
- character equipment persistence
- historical analytics tables

They are valid future concerns, but not part of the initial implementation baseline.

## Final Notes

- this document is the current implementation target
- if we change any major structural decision later, a new decision document should be created instead of rewriting planning history away
