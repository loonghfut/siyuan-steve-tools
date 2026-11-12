/**
 * Runtime host bindings for Calendar internals.
 *
 * The module entry configures this once during startup. Feature, UI, and
 * integration files consume this local context instead of importing the
 * application's global entry module.
 */
export let calendarSettings: Record<string, any> = {};
let calendarModule: any;
let calendarApp: any;

export const calendarModules: Record<string, any> = new Proxy({}, {
    get(_target, property) {
        return property === 'M_calendar' ? calendarModule : undefined;
    },
});

export function configureCalendarContext(
    settings: Record<string, any>,
    module: any,
    app?: any,
): void {
    calendarSettings = settings;
    calendarModule = module;
    if (app !== undefined) {
        calendarApp = app;
    }
}

/**
 * Returns the SiYuan App instance injected on the plugin, falling back to `window.siyuan?.ws?.app`.
 */
export function getCalendarApp(): any {
    return calendarApp || calendarModule?.plugin?.app || (typeof window !== 'undefined' ? (window as any).siyuan?.ws?.app : undefined);
}
