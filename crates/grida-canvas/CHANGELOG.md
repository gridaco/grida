# Changelog

All notable changes to the grida-canvas crate will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.0.0-local.2] - 2025-10-19

### Added

- **Infinite Canvas + Flex Layout**: Root nodes (artboards) can be positioned anywhere in the viewport while their children participate in flex layout
- **Universal Flex Layout Support**: All node types (Rectangle, Ellipse, Image, Text, etc.) can now participate in flex layout with `layout_positioning` and `layout_grow` properties
- **Figma Layout Import**: Automatically map Figma's `layoutPositioning` to internal layout properties for all node types
- **Root Node Positioning**: Containers and shapes now respect their x, y coordinates when used as root nodes (infinite canvas)
- **Flex Layout Stacking**: Children are now properly positioned horizontally/vertically instead of stacking at (0, 0)
- **Gap Stretching**: Vertical gap no longer incorrectly grows when parent container height increases
- **Wrap Alignment**: Center alignment now works correctly with flex wrapping enabled
- **Absolute Positioning**: Absolutely positioned children are correctly excluded from flex flow and positioned relative to parent
- **Fixed-size Elements**: Elements maintain their specified dimensions instead of automatically shrinking when overflowing (flex_shrink: 0.0 default)

### Changed

- **Non-uniform Padding**: Support for CSS-style padding with individual values per side (`paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`)

## [0.0.0-local.1] - 2025-10-16

### Added

- **Dual-ID System**: Introduced `NodeId` (u64) for internal operations and `UserNodeId` (String) for public APIs
  - `NodeIdGenerator`: Counter-based ID generation with O(1) performance
  - `IdConverter`: Handles string ID → u64 conversion during .grida file loading
  - Bidirectional ID mapping at Application layer for API boundary
- **LayerEntry System**: Pairs `NodeId` with `PainterPictureLayer` to eliminate redundant ID storage in layers
- **Repository API Split**:
  - `insert(node)`: Auto-generates ID
  - `insert_with_id(id, node)`: Explicit ID for IO layer

### Changed

- **All NodeRec structs** (14 types): Now store only rendering properties
  - Changed from `String` IDs to `u64` IDs for internal operations
  - Removed `id` field entirely - ID managed by graph/repository as HashMap key
  - Removed `name` field - unused in rendering pipeline
- **SceneGraph**: Uses `u64` keys throughout (roots, links, all lookups)
- **Cache Layer**: All geometry and scene caches updated to use `&NodeId` (u64)
- **NodeTrait**: Removed `id()` and `name()` methods - data-only records
- **NodeRepository**: Auto-generates IDs on insertion, eliminating manual ID management
- **Public APIs**: Continue accepting/returning `String` IDs with automatic conversion
- **IO Layer**:
  - `.grida` files: `IdConverter` handles string → u64 conversion with mapping storage
  - Figma files: `FigmaConverter` generates u64 IDs from Figma string IDs

### Removed

- **NodeRec ID field**: Removed from all 14 node types (ErrorNodeRec, GroupNodeRec, etc.)
  - ~8 bytes saved per node
  - Eliminates key-value duplication and potential inconsistency
- **NodeRec name field**: Removed from all 14 node types
  - ~24-32 bytes saved per node (Option<String> overhead)
  - Field was loaded but never used in rendering/logic
- **NodeTrait methods**:
  - `id()` - 28 match arm implementations removed
  - `name()` - 28 match arm implementations removed
- **Placeholder IDs**: No more `id: 0` assignments in factory or IO code

### Fixed

- **Taffy Integration**: Internal u64 IDs now directly compatible with Taffy layout engine
- **Memory Efficiency**: Reduced per-node overhead by ~40 bytes (u64 vs String + removed name)
- **Type Safety**: Single source of truth - ID only exists as HashMap key

## Architecture

### ID Management

**Internal (u64)**:

- Used by: SceneGraph, NodeRepository, all caches, rendering pipeline
- Generation: Counter-based via `NodeIdGenerator`
- Lifetime: Ephemeral (per-session), not serialized

**External (String)**:

- Used by: Public APIs, .grida files, editor integration
- Mapping: Bidirectional HashMap at Application boundary
- Lifetime: Stable, serialized in .grida format

### Data Flow

```
.grida file (String IDs)
  → IdConverter
    → Scene (u64 IDs)
      → Application stores mapping
        → Public APIs convert u64 ↔ String
```

## Verification

- ✅ All targets compile: `cargo check --all-targets --all-features`
- ✅ All tests pass: 103 unit tests + integration tests
- ✅ Clippy clean: `cargo clippy --no-deps --all-targets --all-features`
- ✅ No breaking changes to public APIs

## Migration Impact

**Internal**: Breaking for direct NodeRec construction (internal API only)  
**External**: Zero breaking changes - APIs still use String IDs  
**Performance**: Faster HashMap operations, reduced memory per node  
**Memory Saved**: ~40 bytes per node (8 for ID deduplication + 24-32 for removed name)
