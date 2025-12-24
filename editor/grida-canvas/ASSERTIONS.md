# Grida Canvas - UX Assertions & Test Specifications

This document serves as a living registry of UX-related assertions and test specifications that require human interaction to verify. These are behaviors that are difficult to test programmatically and where automated testing may bloat the test suite unnecessarily. Core math, algorithmic, or low-level features should be covered by formal unit and integration tests, not documented here. This document is maintained to support faster development cycles while ensuring critical UX behaviors are documented and tracked through manual verification.

## Purpose

This document focuses specifically on **UX-related assertions** that are difficult to test programmatically and often require human interaction to verify. Core math, algorithmic, or low-level features should not be documented here—those belong in formal unit and integration test suites.

**Assertions** listed here represent:

1. **Troubleshooting-experienced items**: UX features or behaviors that have caused issues in the past and need verification through manual testing. These often require code cleanup or architectural improvements before comprehensive test coverage can be added, but automated testing may not be practical or may bloat the test suite unnecessarily.

2. **Feature documentation**: UX behaviors that are unlikely to break but document the intended functionality and design decisions. These serve as a reference for what has been built and why, particularly for interactions that require actual usage and human judgment to verify.

3. **Future test specifications**: Natural language descriptions of how UX features should behave, written in a way that can guide manual testing and user acceptance verification. These are typically interactions that are better verified through human testing rather than automated assertions.

## Structure

Each assertion entry is written as a single paragraph that describes the feature as-is and the expected behavior that should be verified. Entries include a date indicating when the assertion was documented or last updated. Entries may optionally include status notes or references to related issues, but the core description should flow naturally without bullet points or structured lists.

## Usage

This document is not a replacement for formal test suites, but rather a bridge between development velocity and test coverage. When implementing or refactoring features listed here, use these assertions as a guide for what behaviors must be preserved or improved.

---

## Assertions

### Vector Resize with Aspect Ratio Preservation (2025-12-08)

Vector nodes support resizing through edge handles (N/S/E/W) and corner handles (NE/SE/NW/SW). When the SHIFT key is held during resize, the aspect ratio should be preserved uniformly across all handle types. The vector network's vertices and segments must scale proportionally to match the transformed bounding box exactly, ensuring that the visual representation remains consistent with the node's dimensions. Edge handles should maintain aspect ratio by scaling both dimensions based on the dominant movement axis, while diagonal handles should scale uniformly in both dimensions. The vector network transformation must always derive its scale factors from the final bounding box dimensions after the aspect-ratio-preserved transformation has been applied, rather than calculating scales independently from raw movement deltas. This ensures that the vector network geometry always matches the bounding box transformation, regardless of handle type or modifier key combinations. Status: Fixed, ready for comprehensive test coverage.

### Conditional Resize Handle Z-Order by Zoom Level (2025-12-09)

When nodes are zoomed out and resize handles appear small on screen, the side handles (north/south/west/east) become more accessible than corner handles, making it easier to resize nodes and double-click on W/E handles for text resize-to-fit functionality. When nodes are zoomed in and handles appear larger, corner handles maintain priority for precise corner manipulation. The system automatically determines handle priority based on how large the node appears on screen (using `MIN_RESIZE_HANDLE_SIZE_FOR_DIAGONAL_PRIORITY_UI_SIZE` as the threshold), ensuring the most relevant handles remain accessible regardless of zoom level. Double-clicking on the side edges (not the corner knobs) triggers resize-to-fit for text nodes.

### Auto-Layout Direct Container Application (2025-12-09)

When applying auto-layout (Shift+A) to a single container selection that has no layout applied, the layout is applied directly to that container rather than wrapping it in a new container. This preserves the container's identity and hierarchy, allowing users to convert existing containers to flex layouts without introducing an additional nesting level. The system checks if the selection is exactly one container node and whether that container's layout property is not set to "flex". If both conditions are met, the flex layout properties are applied directly to the selected container, analyzing its children's spatial arrangement to determine optimal flex direction, spacing, and alignment. This behavior is controlled by the `prefersDirectApplication` parameter which defaults to `true`. When `prefersDirectApplication` is `false`, direct application is disabled and nodes are always wrapped in new containers regardless of selection. If the selection contains multiple nodes, a single non-container node, or a container that already has a flex layout, the default behavior applies where selected nodes are wrapped into new flex containers, maintaining backward compatibility with existing workflows.

### Guideline Event Handling During Canvas Input Modes (2025-12-10)

Guidelines should not be selectable or handle events when the editor is in eager canvas input mode, specifically when content edit mode (CEM) is active or when the insertion tool is selected. The system maintains an `eager_canvas_input` state that is true when either condition is met: when any content edit mode is active (text, vector, bitmap, etc.) or when the tool type is "insert". When `eager_canvas_input` is true, guidelines must not respond to pointer events, cannot be dragged or focused, and should not trigger gesture creation. This prevents guidelines from interfering with canvas input operations such as inserting new nodes or editing content. The behavior applies to both existing guidelines (dragging to reposition) and new guideline creation from the ruler overlay. Users should be able to interact with guidelines normally when not in these input modes, but the guidelines become passive during content creation and editing workflows to ensure smooth canvas interaction.

### Resize Handle Visibility Threshold for Small Nodes (2025-12-21)

When nodes are zoomed out and their viewport size (width or height) falls below the minimum threshold (`MIN_NODE_OVERLAY_RESIZE_HANDLES_VISIBLE_UI_SIZE`), all resize handles are completely hidden to prioritize the translate-drag region. This ensures that thin nodes like text remain easily draggable when zoomed out, as resize handles would otherwise occupy too much of the node's area and interfere with translation gestures. The threshold is calculated based on the physical viewport pixel size, considering both width and height dimensions independently. When either dimension falls below the threshold, resize handles disappear entirely, allowing users to drag nodes smoothly without accidentally triggering resize gestures. This behavior applies to both single node selections and multiple node selection groups, ensuring consistent interaction patterns across all selection types. The resize handles automatically reappear when nodes are zoomed in above the threshold, restoring full resize functionality when handles become large enough to be useful.

### Editor History System Takes Precedence in Content Edit Mode (2025-12-22)

When content edit mode is active and the user is typing in a focused input or contentEditable element rendered as part of canvas content (such as the text editor's contentEditable element in text edit mode), the browser's native undo/redo intercepts Cmd+Z and Cmd+Shift+Z before the editor's history system can respond, preventing users from undoing their way out of content edit mode. Without proper handling, users become trapped in the editing state: they cannot use Cmd+Z to undo their way back through the history stack to exit content edit mode, and must instead commit their changes by pressing Escape or clicking outside the input, which rewrites the forward history state and causes the entire relevant history stack to be permanently lost. To prevent this history loss, Cmd+Z and Cmd+Shift+Z must execute the editor's document-level undo/redo system even when a canvas-related input is focused, allowing users to navigate backward through the history stack to exit content edit mode naturally without committing changes that destroy the forward history. The presence of a focused input field within content edit mode should never prevent the editor's history commands from being triggered, ensuring that undo/redo operations affect document-level changes (node properties, transformations, and content modifications) rather than just the input field's own text editing history. This behavior applies specifically to input elements rendered on behalf of canvas content editing workflows, but should not override browser native undo/redo behavior for regular form inputs or UI widget inputs where native browser behavior is expected and appropriate.

### Container/Frame Title Bar Must Be Above Selection Overlay (2025-12-24)

When a container or frame is selected and its selection overlay is present, the container/frame title bar must remain interactive and should not be blocked by the selection overlay layer. Users must be able to click the title bar to change selection (including Shift-modified selection) and hover it reliably. This requires the title bar UI layer to render with a higher z-index than the selection overlay layer, while still remaining below resize/rotation handles; the z-order is tracked via the `FLOATING_BAR_Z_INDEX` constant and must remain higher than the selection overlay’s z-index.
