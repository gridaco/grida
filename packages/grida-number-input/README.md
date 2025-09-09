# `@grida/number-input`

React hooks for robust number input and slider value handling with comprehensive safety checks and accessibility features.

## Overview

This package provides React hooks for managing number inputs and slider values with comprehensive safety checks, precision handling, and accessibility features. It's designed primarily for the Grida editor but aims to become a general-purpose solution as it matures.

## Features

### Number Input Features

- **Smart Number Parsing**: Handles integers, decimals, and mixed values with proper validation
- **Precision Management**: Automatic precision handling based on step values
- **Value Formatting**: Intelligent formatting with trailing zero removal
- **Suffix Support**: Built-in support for units like `%`, `px`, `em`, etc.
- **Value Scaling**: Display scaling for percentages and other scaled values (e.g., 0.01 → 1%)
- **Configurable Mixed Values**: Type-safe support for custom mixed value types (strings, symbols, etc.)

### Slider Value Features

- **Value Snapping**: Snap to predefined marks within configurable threshold
- **Step Constraints**: Round values to nearest step increment
- **Controlled/Uncontrolled**: Support for both controlled and uncontrolled value management
- **Value Clamping**: Automatic clamping within min/max bounds
- **Radix UI Compatible**: Returns values in array format for Radix UI Slider components

### Safety & Validation

- **NaN Prevention**: Returns `NaN` for empty/invalid inputs instead of `0` to prevent unwanted commits
- **Focus Validation**: Only commits values when input is actually focused
- **Dirty State Tracking**: Only commits values that differ from the last committed value
- **Min/Max Constraints**: Enforces value bounds with proper clamping
- **Step Precision**: Rounds values to match step precision to avoid floating point errors

### Accessibility & UX

- **Keyboard Navigation**: Arrow key support for increment/decrement with step precision
- **Auto-select**: Optional text selection on focus
- **Commit on Blur**: Configurable commit behavior when input loses focus
- **Global Pointer Safety**: Handles cases where input is destroyed before blur
- **Mixed Value Support**: Handles "mixed" state for multiple selected values

### Multi-Unit Support (Planned)

- **Unit Conversion**: Support for different units (px, %, em, rem, etc.)
- **Unit Parsing**: Automatic unit detection and parsing
- **Unit Display**: Configurable unit display and formatting
- **Unit Validation**: Type-safe unit handling

## Installation

```bash
npm install @grida/number-input
# or
pnpm add @grida/number-input
# or
yarn add @grida/number-input
```

## Usage

This package provides React hooks for number input and slider value management:

```typescript
import { useNumberInput, useSliderValue } from "@grida/number-input/react";
```

**Note**: This package requires React as a peer dependency and is optimized for modern bundlers with tree shaking support.

## API Reference

### `useNumberInput<MIXED = "mixed">(props: UseNumberInputProps<MIXED>)`

A comprehensive React hook for managing number input state and behavior with configurable mixed value types.

**Props:**

| Prop            | Type                                       | Default    | Description                                           |
| --------------- | ------------------------------------------ | ---------- | ----------------------------------------------------- |
| `type`          | `"integer" \| "number"`                    | `"number"` | Type of number input                                  |
| `value`         | `TMixed<number \| "", MIXED>`              | -          | Current value (can be number, empty string, or mixed) |
| `step`          | `number`                                   | `1`        | Step size for increment/decrement operations          |
| `autoSelect`    | `boolean`                                  | `true`     | Auto-select text on focus                             |
| `min`           | `number`                                   | -          | Minimum allowed value                                 |
| `max`           | `number`                                   | -          | Maximum allowed value                                 |
| `mode`          | `"auto" \| "fixed"`                        | `"auto"`   | Value change mode                                     |
| `onValueChange` | `(change: NumberChange \| number) => void` | -          | Callback for value changes                            |
| `onValueCommit` | `(change: NumberChange \| number) => void` | -          | Callback for committed values                         |
| `suffix`        | `string`                                   | -          | Optional suffix (e.g., "%", "px")                     |
| `scale`         | `number`                                   | -          | Scale factor for display (e.g., 100 for percentages)  |
| `commitOnBlur`  | `boolean`                                  | `true`     | Commit value when input loses focus                   |
| `mixed`         | `MIXED`                                    | `"mixed"`  | The mixed value identifier (configurable type)        |

### `useSliderValue(options: UseSliderValueOptions)`

A React hook for handling slider values with snapping and step constraints, compatible with Radix UI Slider components.

**Options:**

| Option          | Type                      | Default | Description                                         |
| --------------- | ------------------------- | ------- | --------------------------------------------------- |
| `min`           | `number`                  | -       | Minimum allowed value                               |
| `max`           | `number`                  | -       | Maximum allowed value                               |
| `step`          | `number`                  | -       | Step increment (optional)                           |
| `marks`         | `number[]`                | -       | Array of mark points for snapping (optional)        |
| `defaultValue`  | `number`                  | `min`   | Initial/default value (optional)                    |
| `value`         | `number`                  | -       | Controlled value (optional)                         |
| `onValueChange` | `(value: number) => void` | -       | Callback fired when value changes during dragging   |
| `onValueCommit` | `(value: number) => void` | -       | Callback fired when value is committed (drag ends)  |
| `snapThreshold` | `number`                  | `5%`    | Distance threshold for snapping to marks (optional) |

## Usage Examples

### Basic Number Input

```typescript
import { useNumberInput } from '@grida/number-input/react';

function NumberInput() {
  const { internalValue, handleChange, handleKeyDown, handleFocus, handleBlur } = useNumberInput({
    value: 42,
    onValueCommit: (value) => console.log('Committed:', value)
  });

  return (
    <input
      value={internalValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
```

### Number Input with Custom Mixed Value

```typescript
import { useNumberInput } from '@grida/number-input/react';

function CustomMixedInput() {
  const mixedSymbol = Symbol('mixed');

  const { internalValue, handleChange, handleKeyDown, handleFocus, handleBlur } = useNumberInput<symbol>({
    value: someValue,
    mixed: mixedSymbol,
    onValueCommit: (value) => console.log('Committed:', value)
  });

  return (
    <input
      value={internalValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
```

### Percentage Input with Scaling

```typescript
const percentageInput = useNumberInput({
  value: 0.5,
  suffix: "%",
  scale: 100,
  step: 0.1,
  onValueCommit: (value) => setPercentage(value), // value will be 0.5, display shows 50%
});
```

### Integer Input with Constraints

```typescript
const ageInput = useNumberInput({
  type: "integer",
  value: 25,
  min: 0,
  max: 120,
  step: 1,
});
```

### Slider with Value Snapping

```typescript
import { useSliderValue } from '@grida/number-input/react';
import { Slider } from '@radix-ui/react-slider';

function SnappingSlider() {
  const sliderProps = useSliderValue({
    min: 0,
    max: 100,
    step: 5,
    marks: [0, 25, 50, 75, 100],
    defaultValue: 50,
    onValueChange: (value) => console.log('Changing:', value),
    onValueCommit: (value) => console.log('Committed:', value),
  });

  return (
    <Slider
      min={0}
      max={100}
      value={sliderProps.value}
      onValueChange={sliderProps.onValueChange}
      onValueCommit={sliderProps.onValueCommit}
    />
  );
}
```

### Slider with Step Constraints

```typescript
import { useSliderValue } from '@grida/number-input/react';

function StepSlider() {
  const sliderProps = useSliderValue({
    min: 0,
    max: 10,
    step: 0.5,
    defaultValue: 5,
    onValueCommit: (value) => setValue(value),
  });

  return (
    <Slider
      min={0}
      max={10}
      value={sliderProps.value}
      onValueChange={sliderProps.onValueChange}
      onValueCommit={sliderProps.onValueCommit}
    />
  );
}
```

## Commit Behavior

The hook provides multiple commit scenarios with comprehensive safety checks:

1. **Blur Events**: Commits if value is dirty and valid (forceCommit=true)
2. **Enter/Tab Keys**: Commits if value is valid (forceCommit=true)
3. **Global Pointer Down**: Commits only if focused and dirty (no forceCommit)
4. **Arrow Keys**: Commits immediately with delta changes

## Error Handling

- **Empty Input**: Returns `NaN` instead of `0` to prevent unwanted commits
- **Invalid Input**: Returns `NaN` and skips commit to preserve existing value
- **Mixed Values**: Handles "mixed" state gracefully without committing
- **Focus Loss**: Safely handles cases where input is destroyed before blur
- **Value Constraints**: Automatically clamps values to min/max bounds
- **Precision Loss**: Rounds values to match step precision to avoid floating point errors

## Performance

- Uses `useCallback` for all event handlers to prevent unnecessary re-renders
- Minimal re-renders through careful dependency management
- Efficient parsing with early returns for edge cases
- Global event listener cleanup to prevent memory leaks

## Roadmap

- [x] Configurable mixed value types
- [x] Slider value management with snapping
- [x] Radix UI Slider compatibility
- [ ] Multi-unit support with automatic unit detection
- [ ] Unit conversion utilities
- [ ] Enhanced accessibility features
- [ ] Comprehensive test suite
- [ ] General-purpose API design
