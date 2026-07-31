# One Walmart Feature-Parity Audit — Version 4.1

The old One Walmart command center was reviewed against the shared Version 4
platform. Version 4.1 restores or explicitly represents the highest-value
features from the prior map.

## Preserved and surfaced in Version 4.1

### Navigation and daily workflow

- collapsible control panel
- fit, home, and reset
- current-gaps and covered-store quick views
- active filter controls
- universal search
- clear filters
- Quick Actions workspace
- Help / Workflow Guide

### Map visualization

- RTS markers
- clustered store markers
- selectable radius
- coverage rings
- heatmap
- overlap visualization
- stores-within-radius filtering
- RTS comparison
- new-RTS simulation
- selected territory highlighting

### One Walmart-specific operations

- combined One Walmart RTS pool for core stores
- Acosta RTS eligibility for P&G, Tyson, and Unilever
- Dedicated Team Exposure
- Dedicated Gaps quick view
- dedicated-team gap exports
- all-roster planning rule
- Operational Focus ribbon and workbench
- manager rollups
- current gap finder

### Planning and intelligence

- Model New RTS Placement
- hiring recommendations
- multi-hire planning
- coverage timeline
- network optimizer
- territory balancing
- RTS territory profiles
- coverage health
- resiliency simulator
- side-by-side RTS comparison

### Leadership and reporting

- Executive Dashboard
- Executive Brief
- Leadership Report
- RTM Dashboard
- Territory Report
- CSV exports
- printable/PDF-ready views

### Convenience features restored

- Copy View Link
- Saved Views
- program, filter, radius, center, and zoom persistence in shared links
- data-date and roster/store counts

## Features intentionally not carried forward as primary controls

### Legacy Alignment — Before June 1

The old map could switch between a pre-June legacy alignment and One Walmart
future alignment. The shared platform is designed around the current operating
model. Historical alignment should be reintroduced only when the exact legacy
store and manager-path datasets are supplied as a separate historical program
snapshot.

### Future/Pending RTS excluded from current coverage

The old map distinguished active and future hubs. The current agreed planning
rule is that every RTS row on the maintained roster counts. A future-placement
scenario remains available through simulation and hiring tools rather than an
inactive/future roster switch.

### Hub editing and removal inside the browser

The old map included an edit-mode/context-menu capability to remove hubs and
export hub JSON. Version 4.1 treats the source roster as authoritative. Scenario
changes belong in simulation tools; permanent changes belong in the roster
source.

### Transition/Delta tools

These were already hidden or removed in the final old map and are not restored.

## Data limitations still affecting full old-map parity

The new One Walmart store dataset currently has one manager field but does not
yet contain the complete RM/AM hierarchy and dedicated manager paths used by the
old map. Manager Rollups are therefore preserved, but richer RM-versus-AM
cascading filters require the manager-path datasets or equivalent columns.

The supplied workbook contained P&G and Tyson overlays but no Unilever rows.
Unilever logic is supported and will populate when the source includes those
stores.
