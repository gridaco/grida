#!/usr/bin/env python3
"""
model_info.py - Look up model specs from models.dev

Fetches the models.dev catalog and prints context window, output limit,
cost, and other metadata for a given model ID.

Source: https://models.dev/api.json

Usage:
    python .tools/model_info.py <model_id>
    python .tools/model_info.py --image <model_id>
    python .tools/model_info.py --image --all

Examples:
    python .tools/model_info.py openai/gpt-5-mini
    python .tools/model_info.py anthropic/claude-sonnet-4
    python .tools/model_info.py claude-opus-4
    python .tools/model_info.py --image gpt-image-1.5
    python .tools/model_info.py --image flux-kontext
    python .tools/model_info.py --image --all

The model ID can be an exact match (e.g. "openai/gpt-5-mini") or a
substring search (e.g. "gpt-5-mini", "claude-sonnet-4"). When multiple
providers offer the same model, all matches are shown grouped by
canonical model ID.

Flags:
    --image   Only show models whose output modalities include "image".
    --all     Show all matches (combine with --image to list all image models).

Output is formatted for quick reference when updating lib/ai/models.ts
or lib/ai/ai.ts.
"""

import json
import subprocess
import sys

API_URL = "https://models.dev/api.json"


def fetch_catalog() -> dict:
    """Fetch the models.dev catalog via curl (avoids Python SSL issues on macOS)."""
    result = subprocess.run(
        ["curl", "-s", API_URL],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def find_models(
    catalog: dict,
    query: str | None,
    *,
    image_only: bool = False,
) -> list[dict]:
    """Return all model entries matching query and optional modality filter."""
    matches = []
    for provider_id, provider in catalog.items():
        models = provider.get("models", {})
        for model_id, model in models.items():
            # modality filter
            if image_only:
                outputs = model.get("modalities", {}).get("output", [])
                if "image" not in outputs:
                    continue

            # query filter (skip if --all)
            if query is not None:
                if query not in model_id and query not in model.get("name", ""):
                    continue

            matches.append(
                {
                    "provider": provider_id,
                    "provider_name": provider.get("name", provider_id),
                    **model,
                }
            )
    return matches


def fmt_tokens(n: int | None) -> str:
    if n is None or n == 0:
        return "—"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.0f}K"
    return str(n)


def fmt_cost(c: float | None) -> str:
    if c is None:
        return "?"
    return f"${c}"


def dedup_canonical(matches: list[dict]) -> dict[str, list[dict]]:
    """Group matches by base model name (strip provider-specific prefixes)."""
    groups: dict[str, list[dict]] = {}
    for m in matches:
        # Normalize: strip common prefixes like "us.", "eu.", "global." for bedrock
        base = m["id"]
        for prefix in ("us.", "eu.", "global."):
            if base.startswith(prefix):
                base = base[len(prefix) :]
                break
        groups.setdefault(base, []).append(m)
    return groups


def pick_primary(entries: list[dict]) -> dict:
    """Pick the most relevant entry from a group of duplicates."""
    for e in entries:
        if e["provider"] in ("openai", "anthropic", "google", "vercel", "openrouter"):
            return e
    return entries[0]


def print_model(model: dict, indent: str = "") -> None:
    limit = model.get("limit", {})
    cost = model.get("cost", {})
    modalities = model.get("modalities", {})

    ctx = limit.get("context")
    out = limit.get("output")
    if ctx or out:
        print(f"{indent}Context window : {fmt_tokens(ctx)}")
        print(f"{indent}Output limit   : {fmt_tokens(out)}")
    if limit.get("input"):
        print(f"{indent}Input limit    : {fmt_tokens(limit.get('input'))}")

    has_token_cost = cost.get("input") is not None or cost.get("output") is not None
    if has_token_cost:
        line = f"{indent}Cost (per 1M)  : input={fmt_cost(cost.get('input'))}  output={fmt_cost(cost.get('output'))}"
        if cost.get("cache_read") is not None:
            line += f"  cache_read={fmt_cost(cost.get('cache_read'))}"
        if cost.get("cache_write") is not None:
            line += f"  cache_write={fmt_cost(cost.get('cache_write'))}"
        print(line)
    else:
        outputs = modalities.get("output", [])
        if "image" in outputs:
            print(f"{indent}Pricing        : per-image (not token-based)")

    if modalities:
        print(
            f"{indent}Input modality : {', '.join(modalities.get('input', []))}"
        )
        print(
            f"{indent}Output modality: {', '.join(modalities.get('output', []))}"
        )
    if model.get("family"):
        print(f"{indent}Family         : {model['family']}")
    if model.get("reasoning"):
        print(f"{indent}Reasoning      : yes")
    if model.get("tool_call"):
        print(f"{indent}Tool calling   : yes")
    if model.get("open_weights"):
        print(f"{indent}Open weights   : yes")
    if model.get("release_date"):
        print(f"{indent}Released       : {model['release_date']}")


def print_summary(groups: dict[str, list[dict]], *, image_mode: bool) -> None:
    """Print a compact summary table."""
    print(f"\n{'─' * 60}")
    if image_mode:
        print("  Summary (for lib/ai/ai.ts):")
    else:
        print("  Summary (for lib/ai/models.ts):")
    print(f"{'─' * 60}")

    seen: set[str] = set()
    for base_id, entries in groups.items():
        if base_id in seen:
            continue
        seen.add(base_id)
        primary = pick_primary(entries)
        limit = primary.get("limit", {})
        cost = primary.get("cost", {})

        if image_mode:
            has_cost = cost.get("input") is not None or cost.get("output") is not None
            if has_cost:
                detail = f"in=${cost.get('input')} out=${cost.get('output')}"
            else:
                detail = "per-image"
            print(f"  {base_id}: {detail}")
        else:
            ctx = limit.get("context", "?")
            out = limit.get("output", "?")
            print(f"  {base_id}: contextWindow={ctx}, outputLimit={out}")


def main() -> None:
    args = sys.argv[1:]
    image_only = "--image" in args
    show_all = "--all" in args
    positional = [a for a in args if not a.startswith("--")]

    if not positional and not show_all:
        print(
            "Usage: python .tools/model_info.py [--image] <model_id>\n"
            "       python .tools/model_info.py --image --all\n"
            "\n"
            "Examples:\n"
            "  python .tools/model_info.py openai/gpt-5-mini\n"
            "  python .tools/model_info.py --image gpt-image-1.5\n"
            "  python .tools/model_info.py --image flux-kontext\n"
            "  python .tools/model_info.py --image --all",
            file=sys.stderr,
        )
        sys.exit(1)

    query = positional[0] if positional else None

    print("Fetching models.dev catalog...", file=sys.stderr)
    catalog = fetch_catalog()

    matches = find_models(catalog, query, image_only=image_only)
    if not matches:
        kind = "image models" if image_only else "models"
        target = f"matching '{query}'" if query else ""
        print(f"No {kind} found {target}".strip(), file=sys.stderr)
        sys.exit(1)

    groups = dedup_canonical(matches)

    for base_id, entries in groups.items():
        primary = pick_primary(entries)

        print(f"\n{'=' * 60}")
        print(f"  {primary.get('name', base_id)}  ({base_id})")
        print(f"{'=' * 60}")
        print_model(primary, indent="  ")
        if len(entries) > 1:
            providers = sorted({str(e["provider"]) for e in entries})
            print(f"  Available from : {', '.join(providers)}")

    print_summary(groups, image_mode=image_only)


if __name__ == "__main__":
    main()
