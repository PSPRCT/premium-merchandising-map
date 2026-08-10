# Version 7.14.6 — Regional Hierarchy Navigation Fix

## Manager profile → Regional Manager
The Regional Manager name inside Manager Coverage & Placement Intelligence is clickable again.

The navigation now resolves the regional manager through the same canonical identity system
used for manager/store joins, so display variants do not break the link.

## Regional Manager dashboard cleanup
Also repairs the v7.14.5 regional manager aggregation:
- clean canonical store-to-manager join
- performance metrics merged with store coverage rows
- managers found in store data remain visible even when hierarchy formatting differs
- store counts / coverage / gaps come from actual store alignment
- child manager rows remain clickable into detailed manager intelligence
