declare module '*.svelte' {
    import { ComponentType, SvelteComponent } from 'svelte';
    const component: ComponentType<SvelteComponent<any, any, any>>;
    export default component;
}
