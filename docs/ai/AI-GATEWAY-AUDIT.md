# AI Gateway Audit (H0.7)

**No rewrite.** Audit of `server/aiService.ts` + settings.

## Providers

| Provider | Status | Env | Notes |
|----------|--------|-----|-------|
| Gemini | **Active (prod)** | `GEMINI_API_KEY`, `GEMINI_MODEL` | `gemini-2.5-flash` on VPS; health `aiProvider=gemini` |
| OpenAI | Available | `OPENAI_API_KEY`, `OPENAI_MODEL` | Fallback in chain |
| Ollama | Available | `OLLAMA_ENDPOINT`, `OLLAMA_MODEL` | Local; `stream: false` |
| Claude | **Not implemented** | — | Roadmap H1 |

## Behaviors

| Concern | Status |
|---------|--------|
| API keys | Env + app settings |
| Quota | Provider-side only (no local quota meter) |
| Latency | Per-call timeouts (Ollama/OpenAI); Gemini SDK default |
| Retry | Sequential provider fallback (not exponential) |
| Streaming | Disabled |
| JSON mode | Post-process `extractJson()` |
| Vision | Not a first-class gateway feature yet |
| Embedding | Not in gateway |

## Gemini reachability (H0 audit)

Prod health reports `aiProvider: gemini` with scheduler healthy. Key present on VPS.  
Live content generation not force-run in H0 (cost); treat as **configured & selected**.

## H1 recommendation

Introduce formal AI Gateway: unified timeout/retry/metrics, Claude adapter, optional streaming, quota counters — without changing business callers first.
