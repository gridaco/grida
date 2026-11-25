---
title: Set context size and compaction
description: Set the model context window and automatic compaction threshold for your agent chats.
keywords:
  [agent settings, context window, compaction, configuration, Grida Desktop]
format: md
---

# Set context size and compaction

Grida uses the model's context window to track usage and decide when to
summarize earlier work. You can set a smaller window or ask Grida to
summarize sooner. The context ring shows recent usage.
[See how full the context is](./models-and-usage.md#see-how-full-the-context-is)

1. Open **Settings → Configuration** and choose **Create** to make a starter
   file or **Open** to edit your existing file. From the CLI, edit
   `~/.grida/config.toml` directly. An absolute `GRIDA_HOME` selects a
   different Grida home.
2. Add either setting at the top level, above any table headers such as
   `[desktop]` or `[[hooks]]`. Keep the rest of the file. A minimal file for
   trying automatic compaction looks like this.

   ```toml
   schema_version = 1
   model_auto_compact_token_limit = 4096
   ```

3. Save the file and restart Grida. The settings apply across projects to
   messages accepted after the restart. Running and queued messages keep the
   settings they started with.

Grida uses a working window of 272,000 tokens by default and uses the model’s
capacity when it is smaller. `model_context_window` lets you choose a different
window within the route’s capacity. If the capacity is unknown, 272,000 tokens
is the ceiling. `model_auto_compact_token_limit` can trigger compaction earlier
than the default of 90% of the working window. The provider enforces its own
limits. Remove either key to restore its default.
[Agent configuration reference](../reference/agent-configuration.md)

To try compaction, complete two turns with enough text to reach the threshold,
then send another message. Grida can summarize earlier material while keeping
recent context. The transcript shows **Context compacted** when Grida installs the summary.

The same file holds web search, suggested prompts, and hook definitions.
[Desktop settings](./desktop-settings.md) · [Configure hooks](./hooks.md)
