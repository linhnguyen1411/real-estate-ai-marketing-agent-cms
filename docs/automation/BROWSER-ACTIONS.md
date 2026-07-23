# Browser Actions

**Date:** 2026-07-18  
**Status:** BROWSER ACTIONS COMPLETE  
**Commit intent:** `feat(actions): implement browser action framework`

## Goal

Hoàn thiện **Browser Action Framework** trên kiến trúc đã đóng băng.

| Layer | Responsibility |
|-------|----------------|
| **Action** | Lifecycle orchestration (`prepare` → `execute` → `verify` → `captureEvidence` → `cleanup`) |
| **Destination** | Selectors + DOM strategy only |
| **Browser Runtime** | Pages / CDP (unchanged) |
| **Evidence** | Screenshot before/after, HTML, duration, result, error |

Action **không** biết Facebook.  
Destination **không** biết Comment (chỉ cung cấp CSS/aria candidates + fill/click helpers).

## Implemented actions

| Action | Key | Notes |
|--------|-----|-------|
| PublishAction | `publish` | Unchanged |
| CommentAction | `comment` | |
| ReplyAction | `reply` | |
| ReactAction | `react` | |
| MessageAction | `message` | |
| FollowAction | `follow` | |
| JoinGroupAction | `join_group` | |
| InviteAction | `invite` | |

## Contract (unchanged)

```
prepare()
execute()
verify()
captureEvidence()
cleanup()
```

## Flow

```
Mission
  ↓
Execution Agent
  ↓
Action  (registry / destination.getAction)
  ↓
Destination (selectors + DOM ops)
  ↓
Evidence (reuse publish-evidence runtime)
```

Actions **không** gọi Browser/Playwright trực tiếp — chỉ qua `DestinationActionHost`.

## Mission steps

| Step | Role |
|------|------|
| `browser_suggest_action` | AI suggestion only (`requiresHumanApproval: true`, `autoExecute: false`) |
| `browser_action` | Full lifecycle for one interaction action |

Config example:

```json
{
  "type": "browser_action",
  "config": {
    "action": "comment",
    "destinationKey": "facebook_timeline",
    "actionText": "…",
    "humanApproved": true,
    "dryRun": true
  }
}
```

## AI integration

AI helpers (`suggestComment`, `suggestReply`, `suggestMessage`, …):

- generate / suggest content only
- **never** auto-execute
- Human Approval bắt buộc (`humanApproved` / `actionApproved` / `approvedBy`)

## Evidence

Reuse `runtime/publish-evidence` + `writePublishEvidenceManifest`.

Each action run records:

- screenshot before
- screenshot after
- html snapshot
- duration
- result
- error (if any)
- `actionKey`

## Tests

```bash
npx tsx scripts/test-browser-actions.ts
npx tsx scripts/test-automation-action-framework.ts
npm run test:facebook-timeline
npm run test:mission-engine
npm run lint
```

## Design rules (frozen)

- No new Engine / Runtime / Worker / Queue
- No Control Plane changes
- No Timeline / Group / Browser Runtime publish-path rewrites
- Destination only additive DOM strategy (`getInteractionSelectors`, `captureScreenshotPhase`)
