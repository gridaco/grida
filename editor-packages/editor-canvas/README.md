# A Html5 backend Interactive canvas for runtime frames.

## The system

- Canvas
- Hud
- Event
- Math
- Iframe
- Node
- Host

## General architecture

- `ScaffoldCanvas` - A single component canvas that holds both renderer and eventsystem
- `RenderOnlyCanvas + EventSystem` - A Customizable system for complex and heavy rendering. (use saperate render host with iframe)

## Events

gesture events

- move (pan)
- zoom (pinch)

- create node
- remove node
- move node
- resize node
- rename node
