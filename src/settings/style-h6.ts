import type { SettingSubGroupDefinition, BuildContext } from "./types";

export interface H6StyleConfig {
    backgroundColor: string;
    color: string;
    fontSize: number;
    lineHeight: number;
    paddingV: number;
    paddingH: number;
    borderRadius: number;
    textAlign: "left" | "center";
}

export const H6_STYLE_DEFAULTS: H6StyleConfig = {
    backgroundColor: "#398ecd57",
    color: "#f9f9f985",
    fontSize: 12,
    lineHeight: 16,
    paddingV: 2,
    paddingH: 6,
    borderRadius: 4,
    textAlign: "left",
};

export const H6_STYLE_CENTERED_DEFAULTS: H6StyleConfig = {
    ...H6_STYLE_DEFAULTS,
    textAlign: "center",
};

export const h6StyleDefaults: Record<string, any> = {
    "style-h6-config": { ...H6_STYLE_DEFAULTS },
};

export function buildH6CSS(cfg: Partial<H6StyleConfig> | null | undefined): string {
    if (!cfg || typeof cfg !== 'object') return '';
    const c = { ...H6_STYLE_DEFAULTS, ...cfg };
    return `[custom-st-tldraw="1"][data-subtype="h6"] {
  background-color: ${c.backgroundColor};
  color: ${c.color} !important;
  display: flex;
  align-items: center;
  justify-content: ${c.textAlign === "center" ? "center" : "flex-start"};
  padding: ${c.paddingV}px ${c.paddingH}px;
  height: auto;
  min-height: auto;
  max-height: none;
  line-height: ${c.lineHeight}px;
  font-size: ${c.fontSize}px !important;
  border-radius: ${c.borderRadius}px;
  box-sizing: border-box;
  text-align: ${c.textAlign};
  white-space: normal;
  overflow-wrap: anywhere;
}`;
}

export const h6StyleGroup = (ctx: BuildContext): SettingSubGroupDefinition => ({
    name: "样式设置",
    items: [
        {
            type: "custom",
            title: "h6 标题块样式",
            description: "自定义画板中 h6 标题块的外观样式，支持实时预览",
            key: "style-h6-config",
            value: ctx.settings["style-h6-config"],
            component: "StyleEditor",
        },
    ],
});
