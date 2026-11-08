/**
 * Runtime host bindings for Calendar internals.
 *
 * The module entry configures this once during startup. Feature, UI, and
 * integration files consume this local context instead of importing the
 * application's global entry module.
 */
export let calendarSettings: Record<string, any> = {};
let calendarModule: any;

export const calendarModules: Record<string, any> = new Proxy({}, {
    get(_target, property) {
        return property === 'M_calendar' ? calendarModule : undefined;
    },
});

export function configureCalendarContext(
    settings: Record<string, any>,
    module: any,
): void {
    calendarSettings = settings;
    calendarModule = module;
}
