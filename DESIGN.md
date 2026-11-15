# Ember Liquid Glass

The glass is the product's identity. Its single source is the "Liquid Glass
material system" section in `src/app/globals.css`; components only use the
surface classes `.panel`, `.glass`, `.glass-strong`, `.glass-edge`, `.tile`
for chips resting on a pane and, for form fields, `.glass-input`.

Five layers, bottom to top: the page behind, the blur (`backdrop-filter`), the
refraction ring (`::before`, a 1px lens edge drawn from `--lens-ring`), the
specular (`::after`, one soft glow in the theme colour that follows the
pointer), then the content.

What makes a pane read as a slab rather than a tinted rectangle, all static:

- The ring glints on two opposite corners (`--lens-peak`): where the light
  enters, and weaker where it leaves. A uniform line reads as a border.
- A dark hairline border sits outside the bright ring. Bright inside, dark
  outside keeps the edge crisp on any wallpaper.
- Two inner glows (tight and wide) are the bevel; an inset top light and bottom
  shadow give thickness. Hover only re-points `--panel-catch` /
  `--panel-drop`, so the bevel survives the lift.
- The face carries a corner light top-left and a fainter one bottom-right,
  sized in px. Percentage-based gradients turned small cards milky all over.

`--lens-ring` is declared on each surface so the `--lens-angle` LightingProvider
writes inline resolves per surface. The bright end faces the light: towards the
pointer while lit, 330deg (top-left, light from above) at rest. Dispersion hues
come from `--lens-from` / `--lens-to`, which must stay light colours; tide and
crimson re-point them because their ramp ends are dark.

## Light

LightingProvider is one pointer listener writing CSS variables; nothing in
React re-renders. The light flows after the pointer (exponential follow, the
same at 60 and 120 Hz) and lights every pane within reach, not only the one
under it: `--lit` falls off with distance and `--mx` / `--my` run past 0-100%
outside a pane, so a neighbour's rim glows on the side facing the light.

- The glint lives on the rim (a spotlight in `::before`). The glow in `::after`
  has no hot core: a tight bright dot read as a torch waved over the interface.
- The glow belongs to the pane the pointer is on and has its own variables
  (`--gx`, `--gy`, `--glow`). A neighbour catches light on its rim only, and
  the glow of a pane the pointer has just left fades where it was.
- A press flares the glow where it lands (`[data-glass-press]`). On touch that
  is the whole effect, and a touch only counts once it is clearly not the start
  of a scroll (held ~110 ms, or lifted as a tap).
- Sizes are px, never %: a light has one size whatever it falls on.

Performance rules, each one measured (see the tests in
`scripts/regression.test.mjs`):

- `--mx`, `--my`, `--lit`, `--gx`, `--gy`, `--glow`, `--lens-angle`,
  `--lens-ring`, `--mag-x/y` are registered with `@property … inherits: false`,
  and the two pseudo-elements take the ones they draw with through an explicit
  `inherit`. As plain custom properties every write invalidated the style of
  the whole card's contents, per lit pane, per frame.
- The cursor position is written on the ambient light and the parallax layers,
  never on `<html>`: there it invalidated every element in the document.
- A lit pane carries `data-lit`, which gives its light layers their own
  compositor layers: the rim on every lit pane (`"near"` or `"in"`), the glow
  only on the pane under the pointer (`"in"`). A pointer frame re-rasters a
  gradient or two, not the card, and nothing is promoted at rest.
- If the device cannot hold its frame time while the light moves (two windows
  of 30 frames in a row averaging over 24 ms), neighbours are dropped and only
  the pane under the pointer stays lit. One hitch never trips it.

## Chrome, tiles, top bar

Floating chrome (`.glass-edge`: dock, tab bar, palette, sheets, dropdowns)
draws the same ring merged with its top light-catch in one `::before`, and gets
inner thickness through `--tw-inset-shadow`, the slot Tailwind's `shadow-[...]`
utilities compose into `box-shadow`. Never declare `box-shadow` on chrome: it
would delete those drop shadows. Glass nested in blurred glass cannot sample
the page (the parent is a backdrop root), so nested `.glass-strong` goes dense.

`.tile` is a raised chip on a pane (stat boxes, list rows, callouts): lit top
edge, shaded bottom edge, a breath of gradient, and a real tint in the light
appearance. It lives in `@layer components`, so utilities on the same element
still win. Segmented tracks and input containers are wells, not tiles.

The top bar (`.topbar`) is a pane with glass on: denser at the top, clearer
toward its lower edge, which is a lit lip instead of a hairline border.

## Motion

One vocabulary, in `src/lib/motion.ts`, shared by Framer Motion and CSS:

- Things that move are springs; things that only change (colour, opacity) are
  short eased tweens. Five springs, described by feel (`SPRING_SPEC`: how long,
  how much bounce) and resolved to physics, so an interrupted animation keeps
  its velocity: `snappy` for controls, `smooth` for surfaces, `gentle` for big
  things, `fill` for data, and `bouncy` for confirmation only (ticks, badges,
  the milestone card). Nothing else overshoots.
- `globals.css` carries the same springs as `linear()` easings (`--spring-*`,
  with the time each needs in `--spring-*-ms`). They are generated by
  `springCss`; a test fails with the expected value if the two drift apart.
- Leaving is quicker than arriving (`EXIT`), and opacity leads position
  (`withFade`): the fade is over in about half the time the movement takes.
- Presets instead of numbers: `dialog`, `sheet`, `scrim`, `pop`, `rise()`,
  `row`, `tile`, `card`, `item()`, `swap`, `stamp`. A component that needs a
  raw `stiffness` or bezier is missing a preset; a test rejects both.

Who moves what:

- **Route change**: the screen crossfades (root View Transition), and the new
  page's blocks settle in one after another (`.page-enter`, "Route
  transitions" in `globals.css`). The direct children of a page cascade by
  themselves; `.stagger` on a grid makes its children cascade instead of the
  grid; `.rise` adds a single element. The template drops `.page-enter` after
  a second, so later mounts do not replay it.
- **A view replacing another inside a page** (`.view-turn`, keyed wrapper):
  calendar periods come in from the side they lie on, tabs settle upward.
- **Controls**: every `button` shares one CSS recipe ("controls"): the press
  sinks in fast and springs back, colours ease. It uses `scale`, never
  `transform`, and no opacity: Framer Motion drives those on many buttons and
  a CSS transition on a property it writes every frame smears the animation.
  `--press-scale` lets a control press deeper or not at all.
- **Data**: bars grow from their baseline with `.grow-y` / `.grow-x`, rings use
  the `fill` spring, and `AnimatedNumber` carries a figure to its new value on
  the same spring (written straight to the DOM, no re-render per frame). A
  number only counts up from zero where a ring fills beside it.
- **Lists**: a row opens and closes its own height (`row`); the rows below
  follow in normal flow, so no layout projection. Where finishing something
  re-sorts the list, the row is held for a beat while its tick draws
  (`useTickHold`), closes, and opens in its new place. Grids of cards use
  `layout` so the others glide to make room.
- **The tick** is one component (`CheckMark`): fill, one pulse, stroke drawn.

The glass rule: **panes move, they do not fade under a parent.** An ancestor
with opacity below 1 is a backdrop root, exactly like one with a filter, so
every pane inside loses its frosting until the fade ends. Entrances of panes
are transforms; only floating chrome fades, and then on its own element.

## Rules that are easy to break

- Anything with a `filter` other than `none` is a backdrop root: every card
  inside it stops blurring the page. Route transitions therefore move the page's
  blocks with a transform only (`.page-enter`) and crossfade the screen as a
  root View Transition; they never put a filter on the content.
- No CSS `filter: blur()` inside a pane. WebKit lets the blur escape the
  rounded corner and showed a composited layer above it as a dark box on iPad.
  Draw the glow as a gradient (see the weather widget).
- Declare only the standard `backdrop-filter`; the minifier adds the prefix.

The ambient cursor light is an 840px pane moved with `translate` (a compositor
update, no repaint), behind the surfaces at z-0, faded via `--cursor-visible`.

Appearance (dark default, light, system) is independent of theme and
wallpaper. Light mode re-points tokens in one block at the end of
`globals.css`, with its own light ambient field and a white glare specular.
Rules combine as `[data-appearance][data-glass]` because both attributes sit on
`<html>`.

White in the light appearance: every `white/…` tint (hairlines, fills,
dividers, checkbox outlines) is built by Tailwind from `--color-white`, and the
light block re-points that variable to ink, so the same class reads as a soft
grey there instead of vanishing. Three consequences:

- A colour set in a `style` or an SVG uses `tint(percent)` from `src/lib/tint.ts`
  (never a literal `rgba(255,255,255,…)`), so it follows too.
- White that must stay white (a switch knob, text on a coloured chip) is
  written as a literal: `text-[#fff]`, `bg-[#fff]`. `text-white` would turn
  dark on a light page.
- A region that is dark in both appearances (the weather hero, a photo
  lightbox) carries `.on-dark`, which restores the variable inside it.

Themes (`THEMES` in `src/lib/types.ts`, one `[data-theme]` block each in
`globals.css`): sunset, tide, crimson, orchid, moss, dusk. A theme re-points
the ramp, `--primary`, `--accent`, the glass tint and the ambient wash; a ramp
that ends dark (tide, crimson, dusk) also re-points `--lens-from` / `--lens-to`
and takes light text on the gradient (`--on-sunset`). Cool or green themes
bring their own accent for the light appearance, where the default is warm.

Safety: reduced effects drops the specular, lowers blur and thins particles;
glass off makes surfaces opaque, including Tailwind `backdrop-blur` utilities
and the top bar; `prefers-reduced-transparency`, `prefers-contrast` (dark and
light) and reduced motion (CSS, `MotionConfig`, and no lighting at all) are
honoured. Touch fields use 16px text so iOS does not zoom.

History: the November 2026 ChatGPT overrides (neutral conic rim, near-invisible
specular, 64px cursor dot above content, blur-free transitions) flattened the
material and were removed. The July material is the reference. Later in
November the rim gained its corner glints and pointer spotlight, the specular
lost its hot core, panes gained the bevel and corner light, tiles and the top
bar joined the system, and the lighting was rebuilt to light neighbours while
costing less than before. Measured over the same pointer sweep (Chromium, dev
build, software raster): style recalculation down about 80%, script about 94%;
raster about half with only the hovered pane lit and about a sixth higher with
neighbours lit, so the total is lower in both modes. Not measured on WebKit.
