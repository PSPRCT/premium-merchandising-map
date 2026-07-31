# PSP Coverage Intelligence Platform v3

This release converts the Premium Merchandising command center into the first
active program on a shared PSP analytics platform.

## Active program

- Premium Merchandising — fully functional

## Scaffolded program

- One Walmart PSP — shared UI ready; routing adapter migration pending

## Important

Version 3 does not silently apply Premium's radius-only logic to One Walmart.
The One Walmart adapter must preserve its dedicated-team and remote-routing
business rules.

See:

- `docs/ARCHITECTURE.md`
- `docs/ONE_WALMART_MIGRATION.md`
- `docs/DEPLOYMENT.md`
