export interface DidaSyncFeature {
    readonly id: string;
    start(): void | Promise<void>;
    destroy(): void | Promise<void>;
}

export class DidaSyncCoordinator {
    private readonly features: DidaSyncFeature[] = [];

    register(feature: DidaSyncFeature): void {
        if (this.features.some(item => item.id === feature.id)) {
            throw new Error(`Dida sync feature already registered: ${feature.id}`);
        }
        this.features.push(feature);
    }

    async start(): Promise<void> {
        for (const feature of this.features) await feature.start();
    }

    async destroy(): Promise<void> {
        for (const feature of [...this.features].reverse()) await feature.destroy();
    }
}
