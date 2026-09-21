# Fluid glass interface

## Goal
Turn the existing notebook controls, menus, and overlays into a cohesive aquamorphic glass interface with responsive, iOS-like momentum while preserving the ruled-paper notebook itself.

## What will change
- Create reusable glass surface and spring-motion primitives for icon buttons, segmented controls, floating panels, and modal sheets.
- Restyle the home composer and notebook toolbar with layered translucent surfaces, light refraction, subtle specular highlights, and clearer active/pressed states.
- Add spring-driven press, release, menu, sheet, and page-transition motion that follows pointer gestures instead of relying on abrupt state changes.
- Add swipe-driven notebook page navigation with momentum and a spring snap-back at the first and last page.
- Update the photo menu, notebook drawer, and doubt overlay to open and close with fluid spring motion.
- Respect reduced-motion settings and retain keyboard, focus, disabled, and touch behavior.

## Technical details
- Use CSS spring-like easing, pointer velocity, and requestAnimationFrame-based drag settling without adding a heavy animation dependency.
- Keep animation transforms separate from notebook PDF capture so exports remain unchanged.
- Extend semantic glass, highlight, shadow, and motion tokens in the global design system; avoid hardcoded visual colors in page code.
- Verify the home screen and notebook on desktop and mobile, including swipe paging, menu interactions, text entry, and reduced-motion behavior.
