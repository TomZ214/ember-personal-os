# EmberOS

<!-- impeccable:product-schema 1 -->

## Platform

web

Windows desktop (Tauri/WebView2) and iPhone (responsive web app / home-screen app)
are equally important target devices. The desktop wrapper loads the shared web
application; it is not a separate native design system.

## Users

Tom uses EmberOS as a personal organizer for everyday life and his apprenticeship.
There is no confirmed plan to turn it into a product for other customers.

## Product Purpose

Bring daily tasks, appointments, notes, habits, goals, finances, mail, files and
training reports into one place. Success means completing real daily workflows
comfortably on both Windows and iPhone.

## Operating Context

Windows users interact with a mouse and keyboard; iPhone users need touch-friendly
controls and layouts. The shared interface supports German and English. Training
reports concern the Sparkasse Heidelberg apprenticeship and use German terminology.

## Capabilities and Constraints

- Next.js App Router, React, TypeScript, Tailwind, Zustand and Framer Motion form
  the existing application stack. Read the installed Next.js documentation before
  framework changes, as required by AGENTS.md.
- Local persistence uses localStorage and IndexedDB. Supabase sync is optional
  and covers selected data; training reports and binary attachments currently
  remain local to each browser/device. Do not promise cross-device report sync.
- Existing integrations include calendar, mail, banking and optional AI services.
  Their runtime availability depends on configuration and the user's connections.
- Preserve existing user data. Training report backups can transfer records and
  attachments from the previous Sites checker.
- Integrate features into Ember's own interface and components. The user explicitly
  rejected embedding the Sites interface as an iframe.
- Push completed changes after appropriate checks. Desktop releases require an
  explicit version bump and release tag producing signed Windows installers;
  pushing web source alone does not publish a new EXE.

## Brand Commitments

EmberOS is the established name. Liquid Glass is an explicitly requested part of
its identity. The user is satisfied with the product and requested refinement of
the glass treatment, not replacement of the interface's identity.

## Evidence on Hand

The working application, shared UI components, theme tokens and wallpapers are
the existing visual reference. README.md contains some outdated feature claims;
prefer current source for implementation facts. No customer testimonials or
performance claims have been supplied.

## Product Principles

- Make everyday tasks easy on both Windows and iPhone.
- Preserve data and make storage and sync boundaries clear.
- Keep new features integrated with the existing product.
- Use visual effects to support a readable, usable interface.
- Verify changes before shipping and distinguish web deployments from EXE releases.

## Accessibility & Inclusion

Preserve the existing keyboard focus, dialog focus trapping, reduced-motion,
reduced-transparency and reduced-effects support. No additional personal
accessibility requirements have been specified.
