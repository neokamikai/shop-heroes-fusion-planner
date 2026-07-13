# Shop Heroes Planner - Local MCP Session Contract Decision

## Document Purpose

This document defines the integration contract between:

- the remote-capable Shop Heroes Fusion Planner application
- the local Shop Heroes mod + MCP bridge running on the player's machine

It exists because the planner backend will not have direct access to the local game process or to the local MCP instance.

The frontend must become the bridge between:

- remote planner backend state
- local live game state

This document should be treated as the active decision for MCP-session identity and account binding.

## Why This Decision Exists

The planner may be hosted remotely, while the Shop Heroes mod/MCP remains local to the player's machine.

That means:

- the backend cannot read the local MCP directly
- the frontend must connect to the local MCP
- the frontend must know which local game session belongs to which planner game account

This becomes especially important when the same player has:

- more than one Shop Heroes account
- more than one local game installation
- more than one MCP-capable game instance available over time

Examples:

- Steam account
- non-Steam PC account
- another account mirrored or tracked separately

## Boundary Decision

### Backend Responsibility

The backend remains the source of truth for planner-owned state:

- users
- planner game accounts
- account settings
- planner targets
- planner-tracked crafts
- planner-tracked fusions
- synchronized inventory snapshots when explicitly persisted
- synchronized item-state snapshots when explicitly persisted

### Local MCP Responsibility

The local Shop Heroes mod + MCP remains the source of truth for live runtime state:

- which game session is open right now
- which game account that session belongs to
- hero live state
- craft live state
- fusion live state
- live events
- other directly observed runtime details

### Frontend Responsibility

The frontend acts as the bridge:

- connect to local MCP
- discover local session identity
- bind a local session to a planner game account
- read live snapshot data from MCP
- send normalized sync payloads to the backend

## Core Decision

The planner must not bind a game account only by:

- endpoint URL
- port
- process existence
- manual nickname alone

Those are operational hints, not identity.

The mod/MCP must expose:

1. game-account identity
2. local session identity
3. local installation identity

These three concerns must stay separate.

## Identity Layers

### 1. Game Account Identity

Purpose:

- identify which in-game account/save the session belongs to

Requirements:

- should remain stable across restarts of the same account
- should be the primary binding key between MCP session and planner game account

Preferred fields:

- `accountExternalId`
- `accountDisplayName`
- `accountRegion` optional
- `accountGuildName` optional

Notes:

- `accountExternalId` is the preferred key if the mod can extract a truly stable identifier from the game
- if the game does not expose a hard account id, we may need a derived stable fingerprint, but only as fallback

### 2. Local Session Identity

Purpose:

- identify this specific currently-running game session

Requirements:

- changes when the game is restarted
- useful for connection lifecycle, freshness, and conflict detection

Required fields:

- `sessionId`
- `sessionStartedAt`

### 3. Local Installation Identity

Purpose:

- identify which game installation produced the session

Requirements:

- stable for a given installation
- useful when the same machine has Steam and non-Steam versions installed

Preferred fields:

- `installationId`
- `installationType`
- `installationLabel`
- `installationPath` optional

Examples for `installationType`:

- `steam`
- `pc-non-steam`
- `unknown`

## Proposed Session Descriptor Contract

The local MCP should expose a session descriptor with this shape:

```json
{
  "sessionId": "sh-session-20260705-abc123",
  "sessionStartedAt": "2026-07-05T12:31:58.944Z",
  "installation": {
    "installationId": "shop-heroes-steam-main",
    "installationType": "steam",
    "installationLabel": "Steam Main",
    "installationPath": "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Shop Heroes"
  },
  "account": {
    "accountExternalId": "shopheroes-account-12345",
    "accountDisplayName": "Douglas Main",
    "guildName": "Example Guild"
  },
  "capabilities": {
    "snapshot": true,
    "events": true,
    "heroEquipment": true,
    "plannerOverview": true
  }
}
```

## Minimum Required Fields

The absolute minimum contract should be:

```json
{
  "sessionId": "string",
  "sessionStartedAt": "iso-datetime",
  "installation": {
    "installationId": "string",
    "installationType": "steam|pc-non-steam|unknown",
    "installationLabel": "string"
  },
  "account": {
    "accountExternalId": "string",
    "accountDisplayName": "string"
  }
}
```

If `accountExternalId` cannot be extracted yet, the contract may temporarily expose:

```json
{
  "account": {
    "accountExternalId": null,
    "accountDisplayName": "Douglas Main"
  }
}
```

But this should be treated as transitional, not final.

## Planner Account Binding Model

Each planner `game_account` should be able to store MCP-binding metadata such as:

- `mcp_binding_mode`
- `mcp_account_external_id`
- `mcp_installation_id`
- `mcp_installation_type`
- `mcp_installation_label`
- `mcp_last_session_id`
- `mcp_last_session_seen_at`

This is not the same as storing the MCP endpoint itself as the identity.

The endpoint is connection configuration.

The account/session/installation ids are identity.

## Frontend Flow Decision

### Account Binding Flow

1. user opens planner account settings
2. frontend connects to local MCP endpoint
3. frontend reads the session descriptor
4. frontend displays:
   - installation label/type
   - account display name
   - session start time
5. user confirms binding to the selected planner account
6. frontend sends the binding metadata to the backend

### Sync Flow

1. frontend loads planner account
2. frontend connects to local MCP
3. frontend reads session descriptor
4. frontend verifies the descriptor matches the stored planner-account binding
5. if it matches, frontend syncs snapshot data to backend
6. if it does not match, frontend blocks auto-sync and asks for confirmation

## Sync Safety Rules

The frontend must not silently sync a local MCP session into a planner account when:

- `accountExternalId` differs
- `installationId` differs and account identity is missing
- no prior binding exists and more than one planner account could match

At minimum, the frontend should require confirmation in these cases.

## Recommended MCP Surface Addition

The existing MCP already exposes planner and snapshot tools.

We should add an explicit tool or resource that returns session identity metadata, for example:

- `get_session_descriptor`

This is preferable to trying to infer identity from:

- `list_heroes`
- `get_full_snapshot`
- planner overview summaries

The session descriptor should be a first-class concept.

## Recommended Backend Surface Addition

The backend should later expose account-binding endpoints such as:

- `GET /accounts/:accountId/mcp-binding`
- `PUT /accounts/:accountId/mcp-binding`
- `POST /accounts/:accountId/sync-from-mcp`

Important:

- the backend endpoint `sync-from-mcp` should receive normalized data from the frontend
- it should not assume direct access to the MCP

## Current Practical Mapping From Existing MCP Data

Today, even before the session descriptor exists, the current MCP already exposes useful account-state hints:

- `hero.name`
- `hero.level`
- `hero.isLocked`
- `hero.isRecruitable`
- `hero.equipped`
- runtime craft/fusion/trade state

For example:

- `isLocked: true` can already be interpreted as `character not unlocked in this account`

This is useful for sync logic, but it is not sufficient to identify which game account produced the snapshot.

That is exactly why this contract is needed.

## Decision Summary

- the remote planner backend will not connect directly to the local MCP
- the frontend is the integration bridge
- the local MCP must expose explicit session identity metadata
- binding must be based primarily on game-account identity, not endpoint heuristics
- session identity, account identity, and installation identity are separate concerns
- the planner should persist MCP-binding metadata per `game_account`
- sync should be blocked or confirmed when identity mismatches occur

## Next Implementation Steps

1. update the mod/MCP contract to expose a first-class session descriptor
2. extend planner schema/backend to store MCP-binding metadata per account
3. add frontend account-binding UI
4. implement frontend-driven sync from MCP to backend
