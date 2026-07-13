# Shop Heroes Planner - Agentic Assistant Runtime Decision

## Document Purpose

This document defines the runtime model for the Shop Heroes Planner assistant.

It replaces the current request-response mental model with an event-driven, agentic execution flow where:

- the frontend opens a persistent websocket session
- the backend orchestrates an assistant run
- the LLM acts as a planner and synthesizer, not as a blind single-shot answer generator
- the user receives continuous visible progress while the run advances

This document should be treated as the active decision for assistant execution behavior.

## Why This Decision Exists

The current direct API call pattern is too limited for the assistant we want to build.

Problems with the current approach:

- the UI waits silently for a single final answer
- slow LLM responses feel like the page is stuck
- the backend sends too much context at once
- the LLM is encouraged to reason over a large state blob instead of asking only for what it needs
- timeout behavior becomes harder to explain to the player

The assistant should feel closer to a real operational partner:

- understand the request
- declare the next checks it intends to do
- fetch only the required data
- cross-check findings
- produce a grounded answer
- keep the player informed throughout the run

## Core Decision

The assistant runtime will be event-driven and websocket-first.

The frontend will not wait on a single blocking HTTP response for conversational execution.

Instead:

1. the frontend opens an authenticated websocket connection to the planner backend
2. the frontend submits a run request
3. the backend creates a tracked assistant run with a `requestId`
4. the backend emits incremental progress events during reasoning and data gathering
5. the backend emits a final completion or failure event when the run ends

HTTP may still exist for narrow utility paths, but conversational execution should be modeled as a run, not as a blocking request.

## Assistant Role Decision

The LLM must not receive the entire game state and be told to infer everything in one shot.

The LLM should act as an orchestrator with bounded responsibilities:

1. interpret the player's intent
2. decide which information is required
3. request focused data retrieval steps
4. inspect the returned facts
5. decide whether more verification is needed
6. synthesize the final answer

This means the assistant runtime should prefer:

- narrow data pulls
- explicit intermediate reasoning steps
- explainable progress
- deterministic tool/query boundaries

It should avoid:

- giant context dumps by default
- hidden multi-second silence
- single-pass speculative reasoning over stale or unnecessary state

## Runtime Principles

### 1. Progress Must Be Visible

The player should regularly see what the assistant is doing.

Examples:

- understanding the request
- deciding which checks are needed
- checking hero status
- checking equipped items
- reviewing break chance rules
- cross-checking the result
- drafting the answer

### 2. Data Access Must Be Focused

The assistant should pull only the data needed for the current question.

Example:

If the user asks whether Albert is fully optimized for `break chance 0`, the runtime should prefer a sequence like:

1. identify that the target hero is `Albert`
2. retrieve Albert's live hero status
3. retrieve Albert's equipped items
4. retrieve break chance references or proficiency interpretation rules
5. compare current equipment to the stated goal
6. answer

It should not begin by loading every planner record and every live runtime detail unless the question truly requires that scope.

### 3. The Backend Owns Orchestration

The frontend should render state and send user intent.

The backend should own:

- run lifecycle
- event emission
- query ordering
- retries
- timeouts
- final answer assembly

### 4. The Frontend Owns Experience

The frontend should render assistant runs as a visible timeline, not as a spinner-only interaction.

The user should be able to see:

- the run status
- the current step
- completed steps
- errors if they happen
- the final answer

### 5. The Runtime Should Be Reusable

This execution model should become a shared internal pattern for future agentic features across projects.

Examples:

- roster analysis assistant
- crafting optimization assistant
- party preparation assistant
- future game tools with similar live-state orchestration needs

## Transport Decision

### Websocket

The assistant runtime will use websocket transport for conversational runs.

Reasons:

- immediate server-to-client progress delivery
- no need to keep a browser request pending
- easier delivery of intermediate steps
- better fit for long-running agentic execution
- easier future support for streamed partial answers

### HTTP

HTTP remains appropriate for:

- authentication
- bootstrap data
- CRUD operations
- explicit sync operations
- narrow fallback endpoints if needed

## Event Contract

All assistant websocket events should include:

- `type`
- `requestId`
- `timestamp`
- `accountId`

Optional fields vary by event type.

### Client to Server

#### `assistant.run.create`

Purpose:

- start a new assistant run

Suggested payload:

```json
{
  "type": "assistant.run.create",
  "requestId": "uuid-or-client-generated-id",
  "timestamp": "2026-07-08T18:30:29.000Z",
  "accountId": "planner-account-id",
  "payload": {
    "prompt": "How is Albert equipped? Is he fully optimized for break chance 0?",
    "localSessionDescriptor": {},
    "localPlannerOverview": {},
    "clientContext": {
      "activeTab": "assistant"
    }
  }
}
```

#### `assistant.run.cancel`

Purpose:

- ask the backend to stop a still-running assistant run

Suggested payload:

```json
{
  "type": "assistant.run.cancel",
  "requestId": "same-run-id",
  "timestamp": "2026-07-08T18:30:35.000Z",
  "accountId": "planner-account-id"
}
```

### Server to Client

#### `assistant.run.accepted`

Purpose:

- confirm the run was accepted

Suggested fields:

- `status`: `queued` or `running`
- `message`

#### `assistant.run.progress`

Purpose:

- describe a meaningful execution step

Suggested fields:

- `phase`
- `message`
- `stepIndex`
- `stepCount`
- `details` optional

Suggested `phase` values:

- `understanding_request`
- `planning_steps`
- `querying_planner_data`
- `querying_live_session`
- `querying_hero_data`
- `querying_equipment`
- `querying_break_chance_rules`
- `cross_checking_findings`
- `forming_answer`

Example:

```json
{
  "type": "assistant.run.progress",
  "requestId": "same-run-id",
  "timestamp": "2026-07-08T18:30:36.000Z",
  "accountId": "planner-account-id",
  "phase": "querying_equipment",
  "message": "Checking Albert's equipped items and quality bands.",
  "stepIndex": 4,
  "stepCount": 6
}
```

#### `assistant.run.tool_started`

Purpose:

- indicate that a focused query/tool step started

Suggested fields:

- `toolName`
- `message`
- `inputSummary`

#### `assistant.run.tool_finished`

Purpose:

- indicate that a focused query/tool step finished

Suggested fields:

- `toolName`
- `message`
- `resultSummary`

#### `assistant.run.completed`

Purpose:

- deliver the final answer

Suggested fields:

- `model`
- `content`
- `summary`
- `supportingFacts` optional

#### `assistant.run.failed`

Purpose:

- deliver a visible failure instead of silent timeout behavior

Suggested fields:

- `code`
- `message`
- `retryable`

#### `assistant.run.cancelled`

Purpose:

- confirm that a run was cancelled

## Execution Lifecycle

The expected runtime flow is:

1. client sends `assistant.run.create`
2. server emits `assistant.run.accepted`
3. server emits `assistant.run.progress` with request understanding
4. server emits `assistant.run.progress` with the planned investigation steps
5. server executes focused data retrieval steps
6. server emits tool start and finish events when useful
7. server emits additional progress updates as findings are cross-checked
8. server emits `assistant.run.completed` with the final answer

If something breaks:

1. server emits `assistant.run.failed`
2. the UI keeps the visible timeline
3. the user can retry without losing the question text

## Initial Execution Model

The first production-ready version does not need unrestricted tool-calling.

It should begin with a bounded planner loop implemented in backend code:

1. classify the request
2. map the request to an investigation template
3. fetch the required planner data
4. fetch the required live local-session data when available
5. assemble a concise evidence pack
6. send the evidence pack plus the user question to the LLM
7. return the answer

This is intentionally more controlled than a fully open agent loop.

It gives us:

- predictability
- easier debugging
- safer performance
- clearer progress reporting

Later, we can evolve toward a richer agent runtime if it continues to earn its complexity.

## Initial Investigation Templates

The first useful request classes likely include:

- hero equipment review
- break chance safety review
- ready-operations summary
- roster availability summary
- planner blocker review

Example template for hero equipment review:

1. resolve hero identity from the prompt
2. fetch hero live snapshot
3. fetch equipped items
4. fetch break chance reference guidance
5. evaluate mismatches against the requested goal
6. ask the LLM to explain the result clearly

## Data Source Preference

When possible, the runtime should prefer data sources in this order:

1. focused live session data for the specific entity being discussed
2. focused planner/account data for the same entity
3. broader overview data only when needed
4. full snapshot only as an explicit fallback

This keeps runs faster and reduces unnecessary pressure on the game bridge.

## Timeout and Failure Decision

Timeout should be treated as a visible run outcome, not as a hanging page.

Rules:

- every run should have a maximum execution window
- every focused query step should have its own timeout budget
- partial progress already shown to the user should remain visible
- failures should explain which step failed when possible

Examples of user-facing failure messages:

- local session is not available
- hero could not be resolved from the request
- live equipment data could not be fetched in time
- LLM response timed out while forming the final answer

## UI Decision

The assistant panel should evolve from:

- textarea
- submit button
- final response block

to:

- conversation input
- run status header
- visible step timeline
- progress messages
- final answer card
- failure card when needed

The player should feel accompanied during execution, not ignored while the system thinks.

## Backend Boundary Decision

The websocket assistant runtime should remain a planner-backend concern.

The local MCP bridge remains responsible for:

- local session identity
- local runtime data
- live game observations

The planner assistant runtime may consume those sources, but should not move assistant orchestration into the mod or MCP layer.

## Future Reuse Decision

This assistant model should be considered a reusable internal pattern for future agentic implementations.

The reusable premise is:

- agentic assistants should execute as visible runs
- the orchestrator should expose progress continuously
- the LLM should plan focused checks instead of consuming giant opaque state dumps
- the UI should show reasoning progress as operational feedback, not just a final answer

If a future project needs a conversational agent, this pattern should be the default starting point unless the problem clearly does not justify it.

## Implementation Path

Recommended implementation order:

1. introduce websocket transport in the planner backend
2. add authenticated assistant run events
3. update the frontend assistant tab to render run progress
4. implement one bounded investigation template for hero equipment review
5. add cancellation support
6. add more request classes
7. only then consider richer multi-step autonomous planning

## Decision Summary

The Shop Heroes Planner assistant will evolve into a websocket-driven, agentic runtime.

The assistant should behave like an operational partner:

- understand the request
- announce what it is checking
- gather focused evidence
- cross-check findings
- explain the result clearly

This decision also becomes a reusable pattern for future agentic systems we build.
