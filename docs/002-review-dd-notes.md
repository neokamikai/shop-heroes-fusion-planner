# Notes made by DD for the project

## Global Vs Account data:

- `character affinities` for equipment is global, not per-user/per-account


## Tables

### `users`

We might implement login through social media like google, facebook, instagram, steam and others, we better think on how to structure it

### `game_accounts`
fine by me

### `catalog_categories` & `catalog_subcategories`
these are fine by me


### `catalog_items`
i saw your note to keep tier as plain text but i think that might not be an actual good idea, because we might have trouble later on to migrate this to a better structure, i mean, if we decide to do it when other users, beside me, are using the platform, we could have problems when migrating the data and this could result in having a downtime for the update, of course we could ensure this wouldn't happen, but then i think **why should we leave this gap to migrate later, when we are still designing everything**, so i'd rather make choose to make it 'right' right now than leave it to do later on

### `account_settings`
i prefer to have a key/value pair settings architecture, than by-column settings architecture, its easier to add support for more settings without having to change the table structure for each new setting we might add in the future, though we might need a separate table to define the available settings and possible default values

### `account_character_states`
as an addition i think it's nice that we have support for character equipment, but we'll discuss this later on, but the rest seems fine to me

### `account_character_affinities`

if you thought of this for equipment affinity, this is fixed, not something to unlock, the character itself may be unlocked/hired or not, which makes the character available for planning items to, but again, this has nothing to do with which equipments the character can equip, this is global and immutable and should be persisted in the catalog not by user/account

### `account_item_states`

this is ok

### `account_targets`

seems ok to me, i just think we should have a tier table as well, to have a stronger reference, plain text is too weak and may cause incosistency, including with UI otherwise we should have a strong check for payloads, though we should have it either way

### `account_fusions`

we wont be keeping completed nor cancelled fusions in the database, in other words, completed/cancelled means it should be deleted

## Migration and Seeds sequence

fine by me

## Final notes

- We wont have the `Load Ripped Catalog` anymore, all items in the catalog should inserted through seed, or at least until further notice
- We should thread quality tiers with care, plain text feels too weak to me
- We wont have the `Create/Add Character` feature, if any character is missing we should register it through seed
- We'll need some kind of user feedback for users to report bugs/missing data, request features
- A webmaster dashboard might be nice, but we should handle with much care, maybe have a role system to add to the account to allow access for the webmaster dashboard, but the existence of this dashboard should not be disclaimed in anyway to the user, we might even have a separate web project for it, to avoid any kind of leaks, we may discuss what would be available in this dashboard later on, but it'll probably be just graphics and reports about the platform usage, counts, etc, but we'll talk about it later
 


