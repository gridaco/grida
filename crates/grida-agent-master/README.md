# Grida agent master

Conversational product policy over `agent-kit-runtime`. The master selects model
input, tools, bounded continuation, and a persistent completion account. Providers,
execution authority and tool implementations are supplied by its host.

Continuation records retain the prepared request before execution. Publishing
conversation history and the next continuation is atomic, so restart can reuse
recorded operations without repeating their effects. Runtime and storage retain
their own execution and ownership contracts.
