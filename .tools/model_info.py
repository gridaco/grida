#!/usr/bin/env python3
"""
model_info.py - Look up model specs from models.dev

Fetches the models.dev catalog and prints context window, output limit,
cost, and other metadata for a given model ID.

Source: https://models.dev/api.json

Usage:
    python .tools/model_info.py <model_id>

Examples:
    python .tools/model_info.py openai/gpt-5-mini
    python .tools/model_info.py anthropic/claude-sonnet-4
    python .tools/model_info.py claude-opus-4

The model ID can be an exact match (e.g. "openai/gpt-5-mini") or a
substring search (e.g. "gpt-5-mini", "claude-sonnet-4"). When multiple
providers offer the same model, all matches are shown grouped by
canonical model ID.

Output is formatted for quick reference when updating lib/ai/models.ts.
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


def find_models(catalog: dict, query: str) -> list[dict]:
    """Return all model entries whose ID contains the query string."""
    matches = []
    for provider_id, provider in catalog.items():
        models = provider.get("models", {})
        for model_id, model in models.items():
            if query in model_id or query in model.get("name", ""):
                matches.append(
                    {
                        "provider": provider_id,
                        "provider_name": provider.get("name", provider_id),
                        **model,
                    }
                )
    return matches


def fmt_tokens(n: int | None) -> str:
    if n is None:
        return "?"
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


def print_model(model: dict, indent: str = "") -> None:
    limit = model.get("limit", {})
    cost = model.get("cost", {})
    modalities = model.get("modalities", {})

    print(f"{indent}Context window : {fmt_tokens(limit.get('context'))}")
    print(f"{indent}Output limit   : {fmt_tokens(limit.get('output'))}")
    if limit.get("input"):
        print(f"{indent}Input limit    : {fmt_tokens(limit.get('input'))}")
    print(
        f"{indent}Cost (per 1M)  : input={fmt_cost(cost.get('input'))}  output={fmt_cost(cost.get('output'))}",
        end="",
    )
    if cost.get("cache_read") is not None:
        print(f"  cache_read={fmt_cost(cost.get('cache_read'))}", end="")
    if cost.get("cache_write") is not None:
        print(f"  cache_write={fmt_cost(cost.get('cache_write'))}", end="")
    print()
    if modalities:
        print(f"{indent}Input modality  : {', '.join(modalities.get('input', []))}")
        print(f"{indent}Output modality : {', '.join(modalities.get('output', []))}")
    if model.get("reasoning"):
        print(f"{indent}Reasoning      : yes")
    if model.get("tool_call"):
        print(f"{indent}Tool calling   : yes")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python .tools/model_info.py <model_id>", file=sys.stderr)
        print("  e.g. python .tools/model_info.py openai/gpt-5-mini", file=sys.stderr)
        sys.exit(1)

    query = sys.argv[1]

    print("Fetching models.dev catalog...", file=sys.stderr)
    catalog = fetch_catalog()

    matches = find_models(catalog, query)
    if not matches:
        print(f"No models found matching '{query}'", file=sys.stderr)
        sys.exit(1)

    groups = dedup_canonical(matches)

    for base_id, entries in groups.items():
        # Pick the "primary" entry (prefer openai/ or anthropic/ provider namespaces)
        primary = entries[0]
        for e in entries:
            if e["provider"] in ("openai", "anthropic", "openrouter"):
                primary = e
                break

        print(f"\n{'=' * 60}")
        print(f"  {primary.get('name', base_id)}  ({base_id})")
        print(f"{'=' * 60}")
        print_model(primary, indent="  ")
        if len(entries) > 1:
            providers = sorted({str(e["provider"]) for e in entries})
            print(f"  Available from : {', '.join(providers)}")

    # Print a summary table for easy copy-paste into models.ts
    print(f"\n{'─' * 60}")
    print("  Summary (for lib/ai/models.ts):")
    print(f"{'─' * 60}")
    seen = set()
    for base_id, entries in groups.items():
        if base_id in seen:
            continue
        seen.add(base_id)
        primary = entries[0]
        for e in entries:
            if e["provider"] in ("openai", "anthropic", "openrouter"):
                primary = e
                break
        limit = primary.get("limit", {})
        ctx = limit.get("context", "?")
        out = limit.get("output", "?")
        print(f"  {base_id}: contextWindow={ctx}, outputLimit={out}")


if __name__ == "__main__":
    main()
