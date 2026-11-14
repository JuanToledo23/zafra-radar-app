# AI usage

## Development

Claude Code was used as a coding assistant under the author's direction. The author wrote
the specifications, reviewed every change before it was committed, and made every commit
and push.

## AI inside the product

All in-product AI comes from the research library
([zafra-radar-research](https://github.com/JuanToledo23/zafra-radar-research), built and
published before the event). This application only loads its precomputed outputs. Details,
training data and metrics: the library's `AI_USAGE.md` and `docs/AI_COMPONENTS.md`.

| Component | What it is |
|---|---|
| Cane / non-cane gate | Logistic regression trained in the library on 38 Morelos reference fields |
| Harvest-date detector | xgboost model trained in the library on Morelos cane fields |
| Per-field summaries (optional) | LLM summaries (Claude Haiku 5.5 in the library) checked by a deterministic verifier that rejects any number or date not present in the field's data; a deterministic template is the fallback |

The summaries are loaded precomputed from the library's results. The application makes no
live LLM calls. The alert rules are deterministic code, not AI.

## Generated media

No AI-generated images, video or audio are used in the application.
