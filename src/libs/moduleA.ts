export class ModuleA {
    init() {
        console.log("ModuleA initialized");
    }

    doSomething() {
        console.log("ModuleA is doing something");
    }
    onunload() {
        console.log("ModuleA unloaded");
    }
}