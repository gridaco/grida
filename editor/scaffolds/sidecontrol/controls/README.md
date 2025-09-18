# Controls & Notes on adding one.

- use `modal={false}`

the portal ui WILL conflict wht the surface event listeners, cansing canvas element behind the ui to be selected, for portal ui, such as Select / Dropdown / etc.

https://github.com/radix-ui/primitives/issues/1785
