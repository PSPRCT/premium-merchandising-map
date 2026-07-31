# PSP Coverage Intelligence Platform v3

## Purpose

Version 3 separates reusable analytics and UI from program-specific routing.

## Shared core

- `core/geo.js` — distance calculations
- `core/coverage-engine.js` — radius coverage, health, and gap placement
- `core/program-registry.js` — available program definitions
- `core/program-loader.js` — namespaced program data loading
- `modules/program-switcher.js` — program-selection UI

## Program adapters

### Premium Merchandising

Uses a radius-based coverage model:

- all stores inside radius are serviceable,
- stores may be unique or shared,
- stores outside all active RTS radii are network gaps.

### One Walmart

The One Walmart adapter is active and applies team-specific RTS eligibility.
It must preserve:

- shared One Walmart PSP routing,
- Tyson/P&G/Unilever dedicated-team restrictions,
- legacy Acosta rules,
- remote trainer eligibility/capacity,
- management-group and team normalization.

## Shared enhancements

Once a program adapter produces normalized coverage/routing outputs, the
following can be reused:

- executive dashboards,
- map layers,
- search and filters,
- gap visualization,
- hiring simulation,
- resiliency views,
- reports and exports,
- RTM/manager dashboards.
