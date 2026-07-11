---
title: "Motion graphics authoring landscape"
description: "A qualitative study of animation models and authoring ergonomics across SVG and Web Animations, Lottie, After Effects, Blender, Rive, dotLottie, Cavalry, Apple Motion, PowerPoint, and Keynote."
keywords:
  - motion graphics
  - animation authoring
  - keyframes
  - timeline
  - lottie
  - after effects
  - blender
  - rive
  - cavalry
tags:
  - internal
  - research
  - authoring
  - editor
  - rendering
format: md
---

# Motion graphics authoring landscape

**Study type:** Qualitative product, format, and workflow survey. This is not a
controlled usability study, a market-share analysis, or a normative animation
specification.

## Scope and method

This study asks two bounded questions:

1. Which persistent animation concepts distinguish professional motion-graphics
   systems from basic property animation?
2. Which apparent capabilities belong to the saved/evaluated model, and which
   are editor ergonomics over that model?

The comparison covers open web standards, interchange formats, timeline-based
compositors, general digital-content-creation tools, interactive vector
runtimes, procedural 2D tools, and presentation software. “Market” denotes
these product and workflow categories; it does not imply revenue, adoption, or
ranking claims.

Sources are the projects' official specifications, manuals, and support
documentation, consulted in July 2026. The descriptions below use each
system's own terms. Product behavior outside the cited material was not assumed.

## Landscape by role

The systems occupy different positions in the path from authoring to delivery:

| system               | primary role in the landscape                 | characteristic model                                               |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| SVG / Web Animations | open document and browser animation semantics | timeline + effect timing + typed property interpolation            |
| Lottie               | portable vector-animation interchange         | frame-based compositions, layers, and animatable properties        |
| Adobe After Effects  | layered motion-graphics authoring/compositing | compositions, layers, property tracks, effects, and expressions    |
| Blender              | general DCC animation and rigging             | Actions, F-Curves, NLA strips, drivers, and constraints            |
| Rive                 | interactive vector content runtime            | timelines, state machines, blend states, layouts, and data binding |
| dotLottie            | packaged Lottie delivery and interactivity    | multiple Lottie animations, themes, assets, and state machines     |
| Cavalry              | procedural 2D motion design                   | attributes, keyframes, Behaviours, Utilities, and generators       |
| Apple Motion         | real-time motion graphics and templates       | keyframes, Behaviors, rigs, replicators, and published controls    |
| PowerPoint / Keynote | presentation choreography                     | ordered effects, cues, and state-to-state slide transitions        |

This role distinction matters. An authoring project can retain controls,
expressions, caches, and editor state that an interchange file intentionally
omits. A runtime asset can retain interaction logic that a linear video export
does not need.

## A convergent evaluation shape

Despite different vocabulary, the systems repeatedly separate the same broad
stages:

```text
authoring views
  timeline · dope sheet · graph editor · state graph · canvas handles
                              |
                              v
persistent animation semantics
  tracks · clips · local time · value sources · constraints · controllers
                              |
                              v
evaluation at time t + declared inputs
                              |
                              v
sampled scene state
                              |
                              v
layout / composition / raster / presentation
```

The key difference between basic animation and motion-graphics systems is not
the existence of an easing curve. It is how many persistent value sources can
be composed, reused, retimed, selected, parameterized, and rendered.

## The established keyframe kernel

### SVG and Web Animations

SVG declarative animation provides `animate`, `set`, `animateTransform`, and
`animateMotion`. SVG processing modes can enable or disable declarative
animation rather than merely pausing it at zero. The model includes base and
animated values, interval timing, repeat behavior, motion paths, and multiple
contributions to a target.

[Web Animations](https://www.w3.org/TR/web-animations-1/) generalizes the
browser model into timelines, animation effects, effect timing, playback
control, keyframes, and composite operations. It separates:

- the timeline that supplies time;
- the timing model that converts time to effect progress;
- keyframe interpolation that converts progress to a property value;
- the effect stack that combines contributions with an underlying value.

The [SVG processing-mode definition](https://www.w3.org/TR/SVG2/conform.html)
and [CSS motion-path model](https://www.w3.org/TR/motion-1/) also make two
boundaries explicit: animation can be a processor capability, and path motion
has anchor, distance, and orientation semantics beyond x/y interpolation.

These standards provide a mature property-animation kernel. They do not
provide the complete composition, template, procedural, and authoring-project
models found in dedicated motion tools.

### Lottie

Lottie is a JSON-based interchange format for animated vector graphics. Its
top-level animation declares a frame rate, in/out points, dimensions, layers,
assets, markers, and replaceable slots. Layers add local start and visibility
times, parenting, transforms, masks, mattes, and precomposition references.
Precomposition layers support time stretch and an animatable time-remap
property. See the official [composition](https://lottie.github.io/lottie-spec/latest/specs/composition/)
and [layer](https://lottie.github.io/lottie-spec/latest/specs/layers/)
specifications.

An animatable Lottie property switches between a static value and an ordered
keyframe array. Keyframes carry frame time, hold behavior, temporal easing
tangents, typed values, and—where applicable—spatial tangents. Scalar, vector,
position, color, gradient, and Bézier-shape properties specialize this common
shape. See [Lottie properties](https://lottie.github.io/lottie-spec/latest/specs/properties/).

Lottie also persists motion-graphics structures that are absent from basic SVG
animation: nested compositions, null layers, track mattes, trim paths, shape
modifiers, auto-orient, and time remapping. Its shape model distinguishes path
geometry, styles, modifiers, grouping, and their order of application. See the
[Lottie shape model](https://lottiefiles.github.io/lottie-spec/specs/shapes/).

The formal specification remains deliberately narrower than the historical
ecosystem. Lottie 1.0 covered features that were commonly implemented and
behaved consistently across players; its published feature list says that not
all features are covered. Expressions remain a commonly used extension outside
the normative format and can execute code. See the
[Lottie specification changelog](https://lottie.github.io/changelog/) and
[format security considerations](https://lottie.github.io/lottie-spec/dev/specs/format/).

This makes Lottie an instructive interoperability boundary: the portable
subset is defined by shared renderer behavior, not by everything an upstream
authoring application can express.

## Layered composition and reuse

### Adobe After Effects

After Effects organizes animation around compositions, ordered layers, and
animatable properties. Its Graph Editor distinguishes value graphs from speed
graphs, and its keyframe model distinguishes temporal interpolation from
spatial interpolation. Temporal modes include linear, Bézier variants, and
hold; spatial properties additionally support spatial paths and roving
keyframes. See [keyframe interpolation](https://helpx.adobe.com/uk/after-effects/using/keyframe-interpolation.html).

A nested composition is both reusable content and a layer in another
composition. The nested source retains its own layer structure and timing; the
containing composition supplies another layer transform and can alter render
ordering. A network of nested compositions therefore forms a hierarchy of
local scene and time domains. See
[precomposing and nesting](https://helpx.adobe.com/uk/after-effects/using/precomposing-nesting-pre-rendering.html).

Two template features expose distinctions that ordinary tracks do not cover:

- **Essential Properties** expose selected source properties on a nested
  composition. An instance can override a source value, keyframes, or an
  expression without changing the reusable source.
- **Responsive Design — Time** marks protected regions whose duration remains
  fixed while unprotected regions stretch when a nested composition or Motion
  Graphics template changes duration.

See [Essential Properties](https://helpx.adobe.com/uk/after-effects/using/essential-properties.html)
and [responsive-time regions](https://helpx.adobe.com/after-effects/using/responsive-design.html).

After Effects also retains domain-specific motion structures:

- shape-layer paths, fills, strokes, and ordered path operations including
  trim, repeater, offset, wiggle, and boolean operations;
- text animator groups whose selectors distribute an effect across
  characters, characters excluding spaces, words, or lines;
- expressions that can drive any keyframe-capable property and link properties
  across layers or compositions;
- composition-level motion-blur parameters including shutter angle, shutter
  phase, minimum samples, and an adaptive sample limit.

These structures are described in the official documentation for
[shape operations](https://helpx.adobe.com/after-effects/desktop/drawing-painting-and-paths/shapes-and-shape-attributes/shape-attributes-paint-operations-path.html),
[text animators and selectors](https://helpx.adobe.com/after-effects/desktop/animating-text/text-animation/animating-text.html),
[expressions](https://helpx.adobe.com/after-effects/using/edit-expressions.html),
and [motion-blur sampling](https://helpx.adobe.com/sg/after-effects/using/assorted-animation-tools.html).

The persistent model is consequently broader than a collection of keyframes.
It includes nested time, ordered geometry operators, selection functions over
generated sub-elements, dependent property values, and temporal rendering.

### Blender

Blender divides reusable animation from the objects that consume it:

- an **F-Curve** describes one property's value as a function of time;
- an **Action** is a data-block containing animation channels and their
  F-Curves;
- an **NLA strip** references an Action and places, scales, repeats, and blends
  it in a larger timeline;
- **NLA tracks** sequence strips and allow several Actions to contribute at the
  same time;
- a **Driver** derives one property from variables, built-in functions, or a
  scripted expression, then may map the result through an F-Curve;
- a **Constraint** derives transforms or other constrained values, with an
  ordered constraint stack.

The [F-Curve introduction](https://docs.blender.org/manual/en/latest/editors/graph_editor/fcurves/introduction.html),
[Actions manual](https://docs.blender.org/manual/en/latest/animation/actions.html),
[NLA track documentation](https://docs.blender.org/manual/en/latest/editors/nla/tracks.html),
[Drivers introduction](https://docs.blender.org/manual/en/latest/animation/drivers/introduction.html),
and [constraint-stack documentation](https://docs.blender.org/manual/en/latest/animation/constraints/interface/stack.html)
describe these layers.

The editors correspond to different views of that data:

- the Dope Sheet presents a scene-wide, timing-oriented view of keys;
- the Action Editor focuses on one Action;
- the Graph Editor exposes F-Curve values, interpolation, easing, handles,
  extrapolation, and modifiers;
- the NLA Editor edits clip placement, scale, repetition, influence, and blend;
- the Drivers Editor exposes property dependencies and their mapping function.

Blender visually distinguishes unanimated properties, properties keyed at the
current frame, properties keyed elsewhere, values changed away from a keyed
sample, and driver-controlled values. This makes the source of a displayed
value inspectable from the ordinary property interface. See the
[animation state-color reference](https://docs.blender.org/manual/en/latest/animation/introduction.html).

Blender's Bake Action operation samples the evaluated result after F-Curve
modifiers, drivers, and constraints and writes ordinary keyframes. Baking is
therefore an explicit boundary between a rich procedural project and a simpler
sampled representation. The same documentation notes that scripted drivers
outside a restricted expression subset use Python, run more slowly, and pose a
security risk for untrusted files.

## Procedural and interactive value sources

### Rive and dotLottie

Rive separates Design mode from Animate mode. An artboard can own multiple
timeline animations and multiple state machines. Selecting a timeline presents
a timeline editor; selecting a state machine presents a graph editor. See
[Design versus Animate mode](https://rive.app/docs/editor/fundamentals/design-vs-animate-mode).

A Rive state machine contains layers, states, transitions, conditions, and
inputs. Timeline animations become states; blend states combine several
timelines using numeric inputs; multiple state-machine layers can contribute to
the same artboard with declared layer precedence. Rive's current data-binding
model uses typed view-model properties that can drive state transitions, blend
weights, and bindable editor properties. See
[state-machine structure](https://rive.app/docs/editor/state-machine/state-machine),
[blend states](https://rive.app/docs/editor/state-machine/states),
[state-machine layers](https://rive.app/docs/editor/state-machine/layers), and
[data binding](https://rive.app/docs/editor/data-binding/overview).

At runtime a state machine advances with elapsed time, evaluates animations,
transitions, and data changes, and can settle when no future change is pending.
External changes unsettle it. This differs from sampling a stateless linear
clip: the controller has persistent state in addition to timeline time. See
[state-machine playback](https://rive.app/docs/runtimes/state-machines).

Rive also animates responsive layout. A layout container can define how its
size and child positions interpolate when content reflows, and children can
inherit the parent's transition parameters. This is derived motion over layout
results rather than a fixed coordinate track. See
[Rive layout animation](https://rive.app/docs/editor/layouts/layout-animation).

dotLottie packages one or more Lottie animations with assets, fonts, themes,
and optional state machines. Its state machine format defines playback states,
global states, transitions, guards, inputs, actions, playback modes, speed, and
marker-selected segments. This places interaction and playback control around
linear Lottie animations instead of adding another property-keyframe grammar.
See the [dotLottie 2.0 specification](https://dotlottie.io/spec/2.0/).

### Cavalry

Cavalry combines keyframed Attributes with procedural Behaviours, Utilities,
generators, constraints, and connections between layers. Its Graph Editor can
show both ordinary keyframe curves and the inherited curve produced when, for
example, a Noise Behaviour drives an Attribute. See the
[Cavalry Graph Editor](https://cavalry.studio/docs/user-interface/menus/window-menu/scene-window/graph-editor/).

The Graph Editor supports linear, Bézier, and step interpolation; curve
looping, loop-with-offset, and oscillation; curve ghosting; key alignment; and
time/value scaling. In-viewport motion paths expose spatial keyframes and
velocity controls. See
[Cavalry motion paths](https://cavalry.studio/docs/user-interface/menus/window-menu/viewport/motion-paths/).

Animation Control remaps a complete animation curve to a normalized percentage
and permits another Attribute to drive that percentage. The Bake Animation
command samples procedural animation from Behaviours or Magic Easing into
keyframes. See [Animation Control](https://cavalry.studio/docs/nodes/utilities/animation-control/)
and the [Animation menu](https://cavalry.studio/docs/user-interface/menus/animation-menu/).

The coexistence of previewable procedural curves and a bake operation makes
the distinction between editable value generators and sampled interchange
explicit.

### Apple Motion

Apple Motion presents keyframes and Behaviors as complementary animation
sources. Keyframes specify exact values at exact frames. Behaviors generate
values over a duration and include motion, simulation, parameter, text, audio,
camera, particle, and replicator families. Behaviors can affect object
properties, other objects, or parameters of other Behaviors, and their order of
operations with keyframes is significant. See the
[Motion User Guide](https://help.apple.com/motion/mac/) and
[Behavior application model](https://help.apple.com/motion/mac/5.0/help/English/en/motion/usermanual/chapter_9_section_3.html).

Parameter Behaviors include operations such as audio response, averaging,
clamping, linking, quantization, randomization, rate, reverse, and wriggle.
Their results can be combined with keyframes under declared apply modes. See
[Parameter Behaviors](https://help.apple.com/motion/mac/5.0/help/English/en/motion/usermanual/chapter_9_section_10.html).

Motion rigs expose a small set of widgets—sliders, pop-up menus, and
checkboxes—that can control many internal parameters. Published widgets and
parameters form the editing surface presented to Final Cut Pro users while the
template retains its full internal construction. See
[rigs and widgets](https://help.apple.com/motion/mac/5.0/help/English/en/motion/usermanual/chapter_10_section_1.html)
and [published template parameters](https://help.apple.com/motion/mac/5.0/help/English/en/motion/usermanual/chapter_11_section_15.html).

Template timing uses markers to distinguish regions that may stretch, remain
fixed, or loop when a template is applied to media of another duration. The
manual recommends Behaviors for many template animations because they are less
dependent on specific keyframe times. See
[template animation and timing](https://help.apple.com/motion/mac/5.0/help/English/en/motion/usermanual/chapter_11_section_16.html).

## Presentation-oriented authoring

PowerPoint and Keynote reduce the amount of timeline manipulation required for
common presentation motion.

PowerPoint's Morph transition derives an animation from corresponding objects
on adjacent slides. Authors duplicate or otherwise construct a destination
slide, then edit endpoint position, size, rotation, color, or content.
PowerPoint can infer correspondence and also permits explicit correspondence by
giving one object on each slide the same `!!`-prefixed name. See
[Morph](https://support.microsoft.com/en-us/powerpoint/training/use-the-morph-transition-in-powerpoint)
and [Morph correspondence rules](https://support.microsoft.com/en-us/powerpoint/morph-transition-tips-and-tricks).

Within a slide, PowerPoint orders effects in an Animation Pane and offers cue
relationships—On Click, With Previous, and After Previous—plus duration,
delay, repeat, and rewind. Several effects can target one object and may run
concurrently. See
[animation start and speed](https://support.microsoft.com/en-US/PowerPoint/set-the-start-time-and-speed-of-an-animation-effect)
and [multiple effects](https://support.microsoft.com/en-us/powerpoint/apply-multiple-animation-effects-to-one-object).

Keynote's Magic Move follows the same endpoint-state pattern: the transition is
most effective when adjacent slides contain a common object whose position or
appearance changes. See
[Keynote transitions](https://support.apple.com/guide/keynote/add-transitions-tanff5ae749e/mac).

These workflows reveal two authoring abstractions that are distinct from a
curve editor:

- **state-difference authoring**, where correspondence and endpoint changes
  generate intermediate motion;
- **cue-relative sequencing**, where effects are ordered by user actions or
  neighboring effects rather than only by absolute timestamps.

## Motion semantics beyond ordinary keyframes

The systems repeatedly persist the following concepts in addition to basic
property tracks:

| concept                        | manifestations in the surveyed systems                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| reusable animation unit        | Blender Action · Rive timeline · nested AE composition · Lottie animation/precomposition        |
| clip instance                  | Blender NLA strip · AE/Lottie precomposition layer · Rive state referencing a timeline          |
| local time mapping             | NLA strip scale/repeat · AE/Lottie start/stretch/time remap · responsive protected regions      |
| multiple value contributions   | Web Animations effect stack · NLA tracks · Rive layers/blends · Motion Behavior apply modes     |
| derived property value         | Blender Driver/Constraint · AE expression · Cavalry connection/Behaviour · Motion Link Behavior |
| generated-element selection    | AE text selectors · shape repeaters · Cavalry per-character/group and falloff tools             |
| ordered geometry operation     | AE/Lottie trim/repeater/offset/wiggle/boolean shape operators                                   |
| interaction controller         | Rive state machine · dotLottie state machine · PowerPoint click cues                            |
| typed external parameter       | Rive view model · AE Essential Properties · Motion published widgets                            |
| responsive spatial transition  | Rive layout animation · PowerPoint/Keynote state-to-state morph                                 |
| responsive temporal transition | AE protected regions · Motion template markers                                                  |
| temporal rendering             | AE shutter angle/phase and sample limits                                                        |
| simplification boundary        | Blender Bake Action · Cavalry Bake Animation · video/raster export                              |

Some concepts can be flattened for a particular delivery target. Flattening
changes the artifact, however: a baked per-character reveal no longer adapts to
different text; baked layout motion no longer responds to reflow; baked
procedural noise no longer exposes its seed or parameters.

## Authoring ergonomics

### Property-local animation state

The most immediate animation affordance is attached to an ordinary property,
not hidden in a separate timeline. After Effects exposes a stopwatch; Rive
shows a key icon on animatable inspector properties; Blender colors properties
according to whether they are keyed, changed, or driven. These affordances
answer three frequent questions without opening another editor:

- Can this property animate?
- Does it have a key at the current time?
- Which mechanism currently controls its displayed value?

### Multiple views over one channel model

Timing and value shape are edited in separate views because they are different
tasks:

- a Dope Sheet or layer-bar timeline emphasizes order, spacing, duration, and
  synchronization;
- a Graph Editor emphasizes value, velocity, easing, tangent shape, and
  extrapolation;
- an in-canvas motion path emphasizes spatial trajectory and spatial tangents;
- an NLA or clip editor emphasizes reuse, local time, repetition, and blend;
- a state graph emphasizes modes, transitions, conditions, and interaction.

The views are not alternative saved animation systems. They expose different
projections of tracks, clips, paths, or controllers.

### Selection and disclosure

Professional timelines can contain many channels. The surveyed tools
use selection, filtering, hierarchy, disclosure triangles, solo/mute, and
“show animated” modes to control density. Blender separates a scene-wide Dope
Sheet from the single-Action editor; Cavalry loads animated Attributes based on
selected layers, Attributes, or keyframes; AE exposes nested property groups.

This is an ergonomic response to a broad animatable-property model: the
underlying data can be general while the working set remains local.

### Temporal and spatial manipulation

After Effects and Lottie store temporal easing separately from spatial
tangents. Cavalry edits motion paths directly in the viewport while its Graph
Editor edits value curves. This avoids forcing “how fast along the path?” and
“what path?” into one control.

Bulk curve operations are also common: align, scale, reverse, smooth, bake,
reduce, copy easing, change handle type, and loop. Blender includes multiple
smoothing and blending operations; Cavalry exposes transform boxes, ghost
curves, easing copy/paste, and loop modes. These are mostly authoring
operations over persistent curves rather than additional playback semantics.

### Reuse without exposing internal complexity

After Effects Essential Properties, Motion rigs, and Rive data binding all
separate an artifact's internal property graph from the controls intended for
another editor or application. A reusable animation is therefore not merely a
copied subtree: it has an intentional parameter surface, instance overrides,
and a relationship to its source.

### Procedural inspection and baking

Procedural systems are easier to author when their evaluated result remains
visible in familiar curve and canvas tools. Cavalry previews inherited
procedural curves in the Graph Editor. Blender displays driver-controlled
property state and provides a Drivers Editor. Both provide baking operations
that replace a dependency graph with sampled keys when a simpler representation
is needed.

### Endpoint and cue authoring

Presentation tools optimize for authors who know the desired states and
sequence but do not want to manipulate curves. Morph/Magic Move derives motion
from two scene states; On Click/With Previous/After Previous derives start time
from cue order. These are high-level authoring operations with an inspectable
result, not a replacement for lower-level timing and interpolation semantics.

### Motion accessibility

Interactive motion has an environmental dimension absent from traditional
linear video. The `prefers-reduced-motion` media feature reports a request to
remove or replace nonessential motion. WCAG guidance says interaction-triggered
nonessential motion should be disableable and automatically moving content may
need pause, stop, or hide controls. See
[Media Queries Level 5](https://www.w3.org/TR/mediaqueries-5/),
[WCAG animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions),
and [WCAG pause, stop, hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide).

This introduces host policy, alternative motion, and playback-control concerns
beyond the animation curve itself.

## Tooling versus persisted semantics

The survey supports a practical classification:

| capability                               | classification                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| timeline, Dope Sheet, Graph Editor       | editor views over persistent channels                                                                     |
| auto-key/record                          | authoring operation that inserts or updates keys                                                          |
| snapping, easing presets, key alignment  | authoring operations                                                                                      |
| curve ghosting and motion-path overlays  | derived editor visualization                                                                              |
| curve smoothing/reduction                | authoring transformation; result persists as changed keys                                                 |
| bake                                     | authoring/export transformation between rich evaluation and sampled keys                                  |
| clip/Action/precomposition               | persisted and evaluated semantics                                                                         |
| local time, repeat, stretch, remap       | persisted and evaluated semantics                                                                         |
| effect/track blending                    | persisted and evaluated semantics                                                                         |
| driver, constraint, expression, Behavior | persisted semantics when retained; removable only through baking                                          |
| text selector, repeater, falloff         | persisted semantics for content that remains dynamic                                                      |
| state machine and data binding           | persisted controller semantics                                                                            |
| responsive layout motion                 | persisted semantics when layout/content can change at runtime                                             |
| motion blur and shutter                  | persisted render semantics or an explicitly external render profile                                       |
| state-to-state Morph                     | may be compiled authoring output for fixed states; remains semantic when correspondence is evaluated live |

The boundary is observable: if reopening, retargeting, changing dynamic
content, arbitrary-time evaluation, or rendering in another implementation
must preserve a capability, that capability cannot exist only in editor UI.

## Cross-project capability comparison

This table records the characteristic mechanism exposed by the cited systems.
An em dash means the study did not establish a comparable first-class
mechanism; it does not prove that no extension, plug-in, or host integration
exists.

| system               | property animation           | reuse and local time                     | derived/procedural values                 | interaction/control               | responsive/template mechanism        | simplification/delivery boundary |
| -------------------- | ---------------------------- | ---------------------------------------- | ----------------------------------------- | --------------------------------- | ------------------------------------ | -------------------------------- |
| SVG / Web Animations | effects and typed properties | named keyframes; no nested clip model    | CSS/script outside the declarative core   | event timing and host APIs        | processor and media-query policy     | document processing mode         |
| Lottie               | typed animatable properties  | precompositions, stretch, and time remap | shape modifiers; expressions extension    | separate dotLottie state machine  | slots and dotLottie themes           | interchange asset                |
| After Effects        | property tracks              | nested compositions and local time       | expressions, effects, and shape operators | host/scripting integration        | Essential Properties; protected time | render/export                    |
| Blender              | F-Curves                     | Actions and NLA strips/tracks            | drivers, constraints, and modifiers       | external/game logic; rig controls | custom properties and rigs           | Bake Action                      |
| Rive                 | timeline keys                | timelines referenced by states           | constraints, blends, and data binding     | layered state machines            | view models and layout animation     | runtime/export                   |
| Cavalry              | Attribute keyframes          | Animation Control remapping              | Behaviours, Utilities, and connections    | —                                 | —                                    | Bake Animation                   |
| Apple Motion         | parameter keyframes          | reusable Behaviors and templates         | Behaviors, rigs, and replicators          | published host controls           | published widgets and timing markers | convert/render/export            |
| PowerPoint / Keynote | ordered effects              | slides and transition/effect duration    | transition presets and state morph        | click and relative cues           | object correspondence                | video/export                     |

The entries are not claims of full equivalence. For example, an NLA blend, a
Web Animations composite operation, and a Rive blend state all combine motion,
but they operate at different scopes and use different value rules.

## Findings

1. **The keyframe kernel is convergent.** Ordered time/value samples,
   hold/linear/Bézier interpolation, easing, repetition, and typed property
   interpolation recur across standards and tools.
2. **Professional motion projects retain more than keyframes.** Reusable clips,
   nested local time, value-source graphs, selection functions, shape
   operators, controllers, and render-time sampling are persistent semantics.
3. **Reuse introduces an instance model.** Actions, precompositions, timelines,
   and templates separate reusable sources from placed instances, local time,
   and overrides.
4. **Procedural authoring and portability coexist through baking.** Blender,
   Cavalry, and video/render export expose a boundary between rich editable
   evaluation and simpler sampled delivery.
5. **Dynamic content makes some baking lossy.** Per-character text selectors,
   layout transitions, repeaters, and data-bound states cannot remain adaptive
   after they are flattened to fixed element tracks.
6. **Linear animation and interaction are separate layers.** Rive and dotLottie
   place state machines around reusable timeline animations rather than
   replacing the timeline/keyframe model.
7. **Motion-graphics ergonomics are plural views, not plural truths.** Dope
   sheets, graph editors, motion paths, NLA editors, and state graphs expose
   different questions over shared persistent structures.
8. **Templates add semantic responsiveness.** Exposed parameters, instance
   overrides, protected time regions, and duration markers allow one authored
   artifact to survive new content and new durations.
9. **Presentation tools trade curve detail for endpoint and cue authoring.**
   State correspondence and relative sequencing make common choreography
   accessible without erasing the need for an evaluated intermediate result.
10. **Temporal rendering is distinct from temporal evaluation.** Motion blur
    samples an evaluated scene over a shutter interval; it is not another
    interpolation curve.
11. **Interactive motion carries accessibility policy.** Reduced-motion,
    pause, and stop behavior depend on environment and host control as well as
    authored motion.

## Primary source map

### Standards and interchange

- [SVG 2 declarative-animation processing modes](https://www.w3.org/TR/SVG2/conform.html)
- [Web Animations](https://www.w3.org/TR/web-animations-1/)
- [CSS Motion Path](https://www.w3.org/TR/motion-1/)
- [Lottie Animation Community](https://lottie.github.io/)
- [Lottie 1.0 feature changelog](https://lottie.github.io/changelog/)
- [Lottie composition](https://lottie.github.io/lottie-spec/latest/specs/composition/)
- [Lottie properties](https://lottie.github.io/lottie-spec/latest/specs/properties/)
- [Lottie layers](https://lottie.github.io/lottie-spec/latest/specs/layers/)
- [dotLottie 2.0](https://dotlottie.io/spec/2.0/)

### Authoring systems

- [Adobe After Effects keyframe interpolation](https://helpx.adobe.com/uk/after-effects/using/keyframe-interpolation.html)
- [Adobe After Effects precompositions](https://helpx.adobe.com/uk/after-effects/using/precomposing-nesting-pre-rendering.html)
- [Adobe After Effects Essential Properties](https://helpx.adobe.com/uk/after-effects/using/essential-properties.html)
- [Adobe After Effects responsive time](https://helpx.adobe.com/after-effects/using/responsive-design.html)
- [Blender animation manual](https://docs.blender.org/manual/en/latest/animation/index.html)
- [Blender Graph Editor](https://docs.blender.org/manual/en/latest/editors/graph_editor/index.html)
- [Blender NLA Editor](https://docs.blender.org/manual/en/latest/editors/nla/index.html)
- [Rive editor and runtime documentation](https://rive.app/docs)
- [Cavalry documentation](https://cavalry.studio/docs/)
- [Apple Motion User Guide](https://help.apple.com/motion/mac/)
- [PowerPoint Morph](https://support.microsoft.com/en-us/powerpoint/training/use-the-morph-transition-in-powerpoint)
- [Keynote transitions](https://support.apple.com/guide/keynote/add-transitions-tanff5ae749e/mac)

### Accessibility

- [Media Queries Level 5 — reduced motion](https://www.w3.org/TR/mediaqueries-5/)
- [WCAG 2.2 — animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions)
- [WCAG 2.2 — pause, stop, hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide)
