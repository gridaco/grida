# State (property drafting)

There are properties that are highly likely to be updated every frame (e.g. position, rotation, scale, etc.).
This are performed by drag-related user input, and this properties will not be modified direcly to the design model.

The final callback to the higher state holder will be called once after this operation is complete.

## The properties are..

**transform**

- x
- y
- width
- height
- rotation

**style**

- color
