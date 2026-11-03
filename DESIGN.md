# Ember optical glass

The shared `.panel`, `.glass` and `.glass-strong` classes form the surface API.
Content panes absorb more background detail than their edge reflection; floating
navigation has a stronger body, and `.glass-dialog` uses the densest material.
Nested surfaces drop their backdrop pass. Input wells use `--control-fill`.
All material colors and elevation shadows derive from central CSS tokens.

Appearance is independent of accent theme and wallpaper: dark, light, or system.
The optional settings field preserves the existing dark default. Wallpaper scrims
adapt to appearance; this is bounded contrast adaptation, not per-pixel luminance
sampling. The edge gradients simulate refraction; no costly displacement shader
is applied to text or to scrolling content.

Pointer light is confined to the hovered pane and coalesced through rAF. Reduced
effects disable its listener. Light positions ease toward the pointer; the rim
rotates into the light. Neutral surfaces avoid warm tint and heavy outer shadows.
Touch uses a finite light wave on press and less blur. Motion
respects the system preference via MotionConfig. Avoid full-page filter animation
and nested backdrop filters. Real-device 60 FPS is a target, not a measured claim.

Validated: production build, TypeScript, ESLint for application source, regression
tests; browser views of settings in both appearances, mobile calendar/dialog and
local mailbox. iPhone-size browser inspection does not replace Safari hardware QA.
