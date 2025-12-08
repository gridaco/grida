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

### Vector Resize with Aspect Ratio Preservation (2024-12-08)

Vector nodes support resizing through edge handles (N/S/E/W) and corner handles (NE/SE/NW/SW). When the SHIFT key is held during resize, the aspect ratio should be preserved uniformly across all handle types. The vector network's vertices and segments must scale proportionally to match the transformed bounding box exactly, ensuring that the visual representation remains consistent with the node's dimensions. Edge handles should maintain aspect ratio by scaling both dimensions based on the dominant movement axis, while diagonal handles should scale uniformly in both dimensions. The vector network transformation must always derive its scale factors from the final bounding box dimensions after the aspect-ratio-preserved transformation has been applied, rather than calculating scales independently from raw movement deltas. This ensures that the vector network geometry always matches the bounding box transformation, regardless of handle type or modifier key combinations. Status: Fixed, ready for comprehensive test coverage.
