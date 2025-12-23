export class ModuleA {
    init() {
        console.debug("ModuleA initialized");
    }

    doSomething() {
        console.debug("ModuleA is doing something");
    }
    onunload() {
        console.debug("ModuleA unloaded");
    }
}