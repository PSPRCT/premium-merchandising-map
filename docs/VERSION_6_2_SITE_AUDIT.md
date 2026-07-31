# Site Consolidation and Feature Audit — Version 6.2

## Consolidated

The visible control panel previously exposed the same functions through up to
four generations of navigation:

- Version 6 Intelligence
- Version 4 Platform Workspaces
- One Walmart Operations
- legacy Planning & Analysis

Version 6.2 presents one Coverage Command Center. Older IDs remain as hidden
compatibility hooks so saved links and existing JavaScript bindings do not
break.

## Redundant features merged

- Executive Home / Executive Dashboard / Executive Mode / Executive Coverage
  Dashboard → **Executive Overview**
- Current Gaps / Show Uncovered / Current Gap Finder → **Show Uncovered** and
  **Gap Summary**
- Optimize Network / Hiring Recommendation Plan / Model New RTS Placement →
  **Optimize Network**, **Simulate New RTS**, and **Multi-Hire Plan**
- Territory Profiles / RTS Profiles / Open RTS Profile → **RTS Profiles**
- Territory Health / Coverage Health → **Coverage Health**
- Compare RTS / Compare RTS Territories → **Compare RTS**
- Multiple leadership print views → **Executive Brief**, **Leadership Report**,
  and **Territory Report**
- Manager Rollups / Manager Intelligence → **Manager Intelligence**
- Repeated saved-view and export controls → one Reports & Advanced group

## Drill-down behavior

Clickable drill-downs now apply to:

- state summary rows
- manager summary rows
- gap summary rows
- RTS rows and profile buttons
- store popup → Store Intelligence
- placement recommendations → map simulation
- operational focus cards → corresponding analysis

## Missing features restored from the original One Walmart map

### Added in Version 6.2

- unified State/Manager Gap Summary
- saved placement scenarios
- scenario reopen-on-map
- scenario CSV export
- clear workflow-based navigation

### Still dependent on additional data

- separate Regional Manager and Area Manager cascading filters
- dedicated-team RM/AM cascading filters
- historical pre–One Walmart alignment
- monthly trend charts

The current dataset has one manager field. These functions cannot be recreated
faithfully until manager-path or RM/AM columns are supplied.

## Intentionally not promoted

The original map contained a highly specialized Auto-50 planning workflow with
locked placements, exclusions, final review decisions, replacement swaps, and
saved-plan comparison. Those tools are valuable only for formal large-scale
network redesign. Version 6.2 keeps a simpler saved-scenario workflow. The full
Auto-50 workbench should return only when leadership actively needs a
50–100-placement planning exercise.

Browser-based hub deletion/editing also remains retired because the maintained
roster is the authoritative source.

## Recommended next missing capability

The most useful next data enhancement is a manager hierarchy file containing:

- Regional Manager
- Area/Retail District Manager
- Store number or SiteID
- manager email
- effective date

That would restore the strongest ownership drill-down from the original One
Walmart map without reintroducing interface clutter.
