# Calendar Module

The calendar module is organized by responsibility. Keep imports flowing from
the entry/UI layer toward core, data, features, and integrations. Lower-level
folders must not import the module entry point.

| Directory | Responsibility |
| --- | --- |
| `core/` | Shared types, calendar instance lifecycle, write markers, and event-source classification. |
| `config/` | Calendar view persistence, file paths, and required Attribute View field definitions. |
| `data/` | Attribute View queries, cache management, event conversion, and database updates. |
| `ui/` | FullCalendar construction, view filters, groups, floating calendar, and calendar styles. |
| `features/` | User-facing workflows such as schedule creation, quick add, unscheduled events, and statistics. |
| `integrations/` | ICS import/export/share, TickTick synchronization, and lifelog event sources. |
| `listeners/` | SiYuan transaction and network listeners that trigger calendar synchronization. |

## Entry Points

- `module-calendar.ts`: plugin lifecycle, commands, docks, menus, and external integration wiring.
- `ui/calendar-view.ts`: creates an individual FullCalendar instance.
- `data/calendar-data.ts`: the only home for Attribute View event data and database writes.

## Dependency Rules

1. New Attribute View reads, cache changes, or event conversion belong in `data/`.
2. New FullCalendar DOM behavior belongs in `ui/` or a focused module under `features/`.
3. New third-party services belong in `integrations/` and must not depend on UI modules.
4. Use `@/calendar/...` imports across directories. Relative imports are reserved for files within one feature.
