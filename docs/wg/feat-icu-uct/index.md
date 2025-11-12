---
title: Unicode Coverage Tracker (UCT)
description: A working group draft describing the Unicode Coverage Tracker (UCT) feature for the core engine.
---

# Unicode Coverage Tracker / Unicode Count Table (UCT)

## Overview

The **Unicode Coverage Tracker (UCT)** is a proposed core engine feature designed to monitor and report the extent of Unicode character coverage within a given text processing context. By tracking which Unicode characters are supported and which are missing, UCT aims to improve internationalization support, font fallback strategies, and overall text rendering quality.

This document serves as a working group draft to outline the motivation, design, usage, and future directions for the UCT feature.

## Motivation

Modern applications require robust support for the full range of Unicode characters to deliver seamless multilingual experiences. However, many engines and rendering pipelines lack comprehensive mechanisms to track which Unicode characters are actually supported or rendered correctly.

The UCT feature addresses this gap by providing a systematic way to:

- Identify unsupported or partially supported Unicode characters.
- Inform fallback mechanisms to select appropriate fonts or rendering strategies.
- Collect coverage data to guide font development and engine improvements.

## Design

The Unicode Coverage Tracker integrates into the core engine's text processing pipeline. Its key components include:

- **Character Coverage Database:** Maintains a record of Unicode characters and their support status.
- **Tracking Mechanism:** Monitors text input and updates coverage data in real-time.
- **Reporting Interface:** Provides APIs for querying coverage statistics and unsupported characters.
- **Integration Hooks:** Allows other engine components, such as font selection and shaping modules, to leverage coverage information.

The design emphasizes extensibility and efficiency, ensuring minimal performance impact while enabling detailed coverage insights.

## Implementation Notes: Data Layout & Cross-Boundary Design

The Unicode Coverage Tracker's data should be designed with memory layout and cross-boundary efficiency in mind, particularly between JavaScript (JS) and WebAssembly (WASM) components. To achieve this, stable and contiguous data structures such as typed arrays (`Uint32Array`, `BigUint64Array`) in JS and bitsets in Rust are employed.

These structures allow zero-copy sharing of coverage data across the JS↔WASM boundary, minimizing overhead and reducing the cost of synchronization. By representing coverage information as bitsets, each bit corresponds to a Unicode character's coverage state, enabling compact and efficient storage.

A minimal illustrative example:

**JavaScript:**

```js
// Create a bitset to track coverage for 128 Unicode characters
const coverageBuffer = new ArrayBuffer(16); // 16 bytes = 128 bits
const coverageBits = new BigUint64Array(coverageBuffer);

// Mark character at position 65 as covered
coverageBits[1] |= 1n << BigInt(65 - 64);
```

**Rust:**

```rust
use bitvec::prelude::*;

// Create a bitset with capacity for 128 Unicode characters
let mut coverage_bits = bitvec![0; 128];

// Mark character at position 65 as covered
coverage_bits.set(65, true);
```

This approach ensures that coverage data can be efficiently shared and updated across language boundaries without unnecessary copying or transformation.

## Counting vs Boolean Coverage

While the primary design employs a simple boolean bitset to indicate coverage (yes/no), an alternative approach involves maintaining reference counts for each Unicode character's coverage. Instead of a single bit, each character's coverage state is tracked as a count of references, representing how many times it appears or is supported within the current text context.

Counting coverage can be particularly beneficial in interactive editing scenarios where text changes incrementally, such as during typing, undo/redo operations, or partial updates. By maintaining counts, the system can accurately adjust coverage when characters are added or removed, preventing premature clearing of coverage bits and ensuring precise tracking.

However, this introduces additional complexity:

- The coverage data structure must maintain counts, typically as an integer map or array aligned with the bitset.
- Updates require structured edit deltas to increment or decrement counts corresponding to text changes.
- Careful synchronization is needed to keep coverage counts consistent with the underlying text buffer.

A possible data layout for counting coverage pairs the boolean bitset with an integer array holding reference counts:

```js
// Pseudo-structure for counting coverage
const coverageBits = new BigUint64Array(bufferForBits);
const coverageCounts = new Uint32Array(bufferForCounts);
```

Here, the bitset indicates whether coverage is present (count > 0), while the counts provide the exact number of references.

It is important to note that, unlike Blink's approach, this design document does not discuss or implement text-level diffing or complex edit reconciliation strategies. Instead, it focuses on the foundational data structures and concepts necessary for counting coverage in a performant and maintainable way.

## Usage

Developers and applications can utilize UCT to:

- Query which Unicode characters are supported in the current context.
- Receive notifications or logs about unsupported characters during text rendering.
- Adjust font fallback and shaping strategies based on coverage data.
- Generate reports summarizing Unicode coverage for diagnostics or analytics.

Example usage scenarios include multilingual document editors, web browsers, and text rendering engines aiming for comprehensive Unicode support.

## Relationship to ICU/Blink

While ICU provides extensive Unicode and internationalization utilities, UCT focuses specifically on real-time coverage tracking within the core rendering engine. UCT complements ICU by supplying coverage data that can inform ICU's locale and script handling.

Similarly, Blink's text rendering pipeline benefits from UCT by gaining precise coverage information to optimize font fallback and shaping. UCT acts as a bridge between Unicode data libraries and rendering components.

## Future Work

Planned enhancements for UCT include:

- Expanding coverage granularity to include script and block-level statistics.
- Integrating machine learning models to predict missing coverage and suggest fonts.
- Developing visualization tools for Unicode coverage analysis.
- Collaborating with font developers to automate coverage improvements based on UCT data.

Feedback and contributions from the working group and community are encouraged to refine and evolve the Unicode Coverage Tracker.

---

_This document is a working group draft for a core engine feature and is subject to ongoing discussion and revision._
