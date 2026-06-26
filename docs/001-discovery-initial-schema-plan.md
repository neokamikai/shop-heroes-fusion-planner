# Shop Heroes Planner Backend Schema

## Stack Direction

- Frontend: `React`
- Backend: `Node.js`
- Database: `Postgres`
- SQL toolkit: `Knex`
- Database schema: custom schema via env var, never `public`

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

Notes:

- `DB_NAME` must come from env.
- `DB_SCHEMA` should also come from env.
- All migrations and seeds should target `DB_SCHEMA`.

## Global Vs Account Data

Global data:

- catalog taxonomy
- catalog items
- catalog characters

Per-user/per-account data:

- game accounts
- unlocked characters
- character levels
- character affinities
- owned blueprints
- craft unlocked flags
- inventory counts
- planner targets
- crafts
- fusions
- account settings

## Tables

### `users`

Purpose:

- application users

Columns:

- `id` uuid pk
- `email` text unique not null
- `display_name` text not null
- `password_hash` text not null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

### `game_accounts`

Purpose:

- one user may have multiple Shop Heroes accounts

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

- global item category taxonomy

Columns:

- `id` uuid pk
- `code` text unique not null
- `name` text unique not null
- `sort_order` integer not null default 0
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Suggested initial categories:

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

### `catalog_items`

Purpose:

- global item definitions

Columns:

- `id` uuid pk
- `external_slug` text unique not null
- `name` text not null
- `subcategory_id` uuid not null fk -> `catalog_subcategories.id`
- `level` integer not null
- `min_tier` text not null
- `icon_url` text null
- `blueprint_url` text null
- `summary` text null
- `source` text not null default `'seed'`
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Notes:

- category can be derived through subcategory
- `min_tier` can remain text for now to match current planner behavior

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

### `account_settings`

Purpose:

- per-account app configuration

Columns:

- `id` uuid pk
- `account_id` uuid unique not null fk -> `game_accounts.id`
- `craft_slot_count` integer not null default 0
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

### `account_character_states`

Purpose:

- unlocked state and level of each character for a given account

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

### `account_character_affinities`

Purpose:

- per-account affinity choice for each unlocked character and subcategory

Columns:

- `id` uuid pk
- `account_character_state_id` uuid not null fk -> `account_character_states.id`
- `subcategory_id` uuid not null fk -> `catalog_subcategories.id`
- `affinity_level` text not null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Constraints:

- unique `(account_character_state_id, subcategory_id)`

Suggested values for `affinity_level`:

- `Poor`
- `Normal`
- `Optimal`

### `account_item_states`

Purpose:

- per-account blueprint ownership and craft availability for catalog items

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

- inventory counts by account, item, and tier

Columns:

- `id` uuid pk
- `account_id` uuid not null fk -> `game_accounts.id`
- `item_id` uuid not null fk -> `catalog_items.id`
- `tier` text not null
- `quantity` integer not null default 0
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Constraints:

- unique `(account_id, item_id, tier)`

### `account_targets`

Purpose:

- planner targets for one account and one character

Columns:

- `id` uuid pk
- `account_id` uuid not null fk -> `game_accounts.id`
- `character_id` uuid not null fk -> `catalog_characters.id`
- `item_id` uuid not null fk -> `catalog_items.id`
- `target_tier` text not null
- `quantity` integer not null default 1
- `priority` integer not null
- `is_completed` boolean not null default false
- `completed_at` timestamptz null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Constraints:

- unique `(account_id, item_id, target_tier, priority)`

### `account_crafts`

Purpose:

- active and completed crafts

Columns:

- `id` uuid pk
- `account_id` uuid not null fk -> `game_accounts.id`
- `item_id` uuid not null fk -> `catalog_items.id`
- `target_id` uuid null fk -> `account_targets.id`
- `character_id` uuid null fk -> `catalog_characters.id`
- `planned_target_tier` text not null
- `base_tier` text not null
- `crafted_tier` text null
- `status` text not null
- `source` text not null
- `created_at` timestamptz not null default now()
- `completed_at` timestamptz null
- `updated_at` timestamptz not null default now()

Suggested values:

- `status`: `pending`, `completed`, `cancelled`
- `source`: `target`, `catalog`, `manual`

### `account_fusions`

Purpose:

- active and completed fusions

Columns:

- `id` uuid pk
- `account_id` uuid not null fk -> `game_accounts.id`
- `item_id` uuid not null fk -> `catalog_items.id`
- `from_tier` text not null
- `to_tier` text not null
- `status` text not null
- `created_at` timestamptz not null default now()
- `completed_at` timestamptz null
- `updated_at` timestamptz not null default now()

Suggested values:

- `status`: `pending`, `completed`, `cancelled`

## Migration Sequence

Rule:

- one migration per `CREATE` statement

Suggested order:

1. `create_app_schema`
2. `create_users_table`
3. `create_game_accounts_table`
4. `create_catalog_categories_table`
5. `create_catalog_subcategories_table`
6. `create_catalog_items_table`
7. `create_catalog_characters_table`
8. `create_account_settings_table`
9. `create_account_character_states_table`
10. `create_account_character_affinities_table`
11. `create_account_item_states_table`
12. `create_account_inventory_items_table`
13. `create_account_targets_table`
14. `create_account_crafts_table`
15. `create_account_fusions_table`

Suggested file naming:

```text
202606240001_create_app_schema.js
202606240002_create_users_table.js
202606240003_create_game_accounts_table.js
202606240004_create_catalog_categories_table.js
202606240005_create_catalog_subcategories_table.js
202606240006_create_catalog_items_table.js
202606240007_create_catalog_characters_table.js
202606240008_create_account_settings_table.js
202606240009_create_account_character_states_table.js
202606240010_create_account_character_affinities_table.js
202606240011_create_account_item_states_table.js
202606240012_create_account_inventory_items_table.js
202606240013_create_account_targets_table.js
202606240014_create_account_crafts_table.js
202606240015_create_account_fusions_table.js
```

## Seed Sequence

Rule:

- one seed per global data type

Suggested order:

1. `catalog_taxonomy`
2. `catalog_items`
3. `catalog_characters`

Suggested file naming:

```text
001_catalog_taxonomy.js
002_catalog_items.js
003_catalog_characters.js
```

### `001_catalog_taxonomy`

Should create:

- categories
- subcategories linked to categories

### `002_catalog_items`

Should use:

- `__ripped/shop-heroes-items.json`

Should resolve:

- `category` -> `catalog_categories.id`
- `subcategory` -> `catalog_subcategories.id`

### `003_catalog_characters`

Should seed:

- initial global character catalog

## Notes Before Implementation

- `Load Ripped Catalog` in the current standalone is not a backend concern.
- the standalone currently shares affinity by subcategory, and this model preserves that behavior.
- `PvP` is modeled as a separate category, but still reuses subcategory names such as `Axe` and `Staff`.
- this design keeps catalog data normalized while letting account state vary independently per game account.
