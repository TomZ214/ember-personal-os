# Ember Liquid Glass

The glass is the product's identity. Its single source is the "Liquid Glass
material system" section in `src/app/globals.css`; components only use the
surface classes `.panel`, `.glass`, `.glass-strong`, `.glass-edge` and, for
form fields, `.glass-input`.

Five layers, bottom to top: the page behind, the blur (`backdrop-filter`), the
refraction ring (`::before`, a 1px lens edge drawn from `--lens-ring`), the
specular (`::after`, a tight core plus a wide pool in the theme colour that
follows the pointer), then the content. Panels carry inset top light and bottom
shadow for thickness; hover only re-points `--panel-catch` / `--panel-drop`, so
the bevel survives the lift.

`--lens-ring` is declared on each surface so the `--lens-angle` LightingProvider
writes inline resolves per surface. The bright end faces the light: towards the
pointer while lit, 330deg (top-left, light from above) at rest and on touch.
Dispersion hues come from `--lens-from` / `--lens-to`, which must stay light
colours; tide and crimson re-point them because their ramp ends are dark.

Floating chrome (`.glass-edge`: dock, tab bar, palette, sheets, dropdowns)
draws the same ring merged with its top light-catch in one `::before`, and gets
inner thickness through `--tw-inset-shadow`, the slot Tailwind's `shadow-[...]`
utilities compose into `box-shadow`. Never declare `box-shadow` on chrome: it
would delete those drop shadows. Glass nested in blurred glass cannot sample
the page (the parent is a backdrop root), so nested `.glass-strong` goes dense.

Anything with a `filter` other than `none` is a backdrop root too. The page
transition in `template.tsx` therefore ends with `filter: none`; leaving
`blur(0px)` behind silently stops every card from blurring the page.

The ambient cursor light is an 840px pane moved with `translate` (a compositor
update, no repaint), behind the surfaces at z-0, faded via `--cursor-visible`.

Appearance (dark default, light, system) is independent of theme and
wallpaper. Light mode re-points tokens in one block at the end of
`globals.css`, with its own light ambient field and a white glare specular.
Rules combine as `[data-appearance][data-glass]` because both attributes sit on
`<html>`.

Safety: reduced effects drops the specular, lowers blur and thins particles;
glass off makes surfaces opaque, including Tailwind `backdrop-blur` utilities;
`prefers-reduced-transparency`, `prefers-contrast` (dark and light) and reduced
motion (CSS and `MotionConfig`) are honoured. Touch fields use 16px text so iOS
does not zoom.

History: the November 2026 ChatGPT overrides (neutral conic rim, near-invisible
specular, 64px cursor dot above content, blur-free transitions) flattened the
material and were removed. The July material is the reference; the refinements
above were chosen by a four-lens critique with adversarial verification.
