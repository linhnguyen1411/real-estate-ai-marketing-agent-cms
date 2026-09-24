# Capability Matching (G2)

## Agent capabilities

Free-form tokens. Common set:

`scan` · `publish` · `publish_timeline` · `publish_group` · `comment` · `reply` · `messaging` · `browser` · `cdp` · `OCR` · `Vision` · `GPU` · `AI` …

Aliases:

- `publish` ⇒ `publish_timeline` + `publish_group`
- `browser` ⇒ broad accept for claim pre-filter

## Job requirements

Extracted from `AgentJob.type` + `payload`:

- `requiredCapabilities` / `preferredCapabilities`
- `requiredBrowser` / `preferredBrowser`
- `affinityAgentId` / `affinityHostname` / `affinitySourceId`
- `pinMachineId`
- `destination` (infers publish_group vs timeline)

## Browser capability view

Derived from Runtime Snapshot profiles:

logged-in · timeline/group publish · comment/reply · healthy · busy

## Claim pre-filter

`capabilityForJobType` still gates the candidate list; Placement Engine applies richer matching afterward.
