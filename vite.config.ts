import { resolve } from "path"
import { promises as fs } from "fs";
import { defineConfig, loadEnv } from "vite"
import { viteStaticCopy } from "vite-plugin-static-copy"
import livereload from "rollup-plugin-livereload"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import zipPack from "vite-plugin-zip-pack";
import fg from 'fast-glob';
import vitePluginJavascriptObfuscator from 'vite-plugin-javascript-obfuscator';
// @ts-ignore -- JS plugin without type declarations
import vitePluginYamlI18n from './yaml-plugin';
// @ts-ignore -- JS plugin without type declarations
import vitePrivateStatsPlugin from './scripts/vite-plugin-private-stats.js';

const env = process.env;
const isSrcmap = env.VITE_SOURCEMAP === 'inline';
const isDev = env.NODE_ENV === 'development';

const outputDir = isDev ? "dev" : "dist";

console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        }
    },

    plugins: [

        vitePrivateStatsPlugin(),

        svelte(),

        vitePluginYamlI18n({
            inDir: 'public/i18n',
            outDir: `${outputDir}/i18n`
        }),
        // vitePluginJavascriptObfuscator({
        //     options: {
        //         stringArray: true,
        //         rotateStringArray: true,
        //         stringArrayEncoding: ['base64'], // 或 'rc4'
        //         stringArrayThreshold: 0.75,

        //         controlFlowFlattening: true,
        //         controlFlowFlatteningThreshold: 0.75,
        //         deadCodeInjection: true,
        //         deadCodeInjectionThreshold: 0.4,
        //         transformObjectKeys: true,
        //         unicodeEscapeSequence: true
        //     },
        //     apply: 'build'
        // }),
        viteStaticCopy({
            targets: [
                { src: "./README*.md", dest: "./" },
                { src: "./plugin.json", dest: "./" },
                { src: "./preview.png", dest: "./" },
                { src: "./icon.png", dest: "./" }
            ],
        }),

    ],

    define: {
        "process.env.DEV_MODE": JSON.stringify(isDev),
        "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV)
    },

    css: {
        preprocessorOptions: {
            scss: {
                api: 'modern',
                silenceDeprecations: ['legacy-js-api']
            }
        }
    },

    build: {
        outDir: outputDir,
        emptyOutDir: false,
        minify: true,
        sourcemap: isSrcmap ? 'inline' : false,

        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            fileName: "index",
            formats: ["cjs"],
        },
        rollupOptions: {
            onwarn(warning, warn) {
                // 过滤 @radix-ui 等第三方库的 "use client" 模块级指令警告
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message?.includes('"use client"')) {
                    return;
                }
                warn(warning);
            },
            plugins: [
                patchTldrawLoopbackDev(),
                ...(isDev ? [
                    livereload(outputDir),
                    {
                        name: 'watch-external',
                        async buildStart(this: { addWatchFile(file: string): void }) {
                            const files = await fg([
                                'public/i18n/**',
                                './README*.md',
                                './plugin.json'
                            ]);
                            for (let file of files) {
                                this.addWatchFile(file);
                            }
                        }
                    }
                ] : [
                    // Clean up unnecessary files under dist dir
                    cleanupDistFiles({
                        patterns: ['i18n/*.yaml', 'i18n/*.md'],
                        distDir: outputDir
                    }),
                    zipPack({
                        inDir: './dist',
                        outDir: './',
                        outFileName: 'package.zip'
                    })
                ])
            ],

            external: ["siyuan", "process"],

            output: {
                entryFileNames: "[name].js",
                exports: "named",
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name === "style.css") {
                        return "index.css"
                    }
                    return assetInfo.name ?? "[name][extname]"
                },
            },
        },
    }
});


/**
 * Clean up some dist files after compiled
 * @author frostime
 * @param options:
 * @returns 
 */
function cleanupDistFiles(options: { patterns: string[], distDir: string }) {
    const {
        patterns,
        distDir
    } = options;

    return {
        name: 'rollup-plugin-cleanup',
        enforce: 'post',
        writeBundle: {
            sequential: true,
            order: 'post' as 'post',
            async handler() {
                const fg = await import('fast-glob');
                const fs = await import('fs');
                // const path = await import('path');

                // 使用 glob 语法，确保能匹配到文件
                const distPatterns = patterns.map(pat => `${distDir}/${pat}`);
                console.debug('Cleanup searching patterns:', distPatterns);

                const files = await fg.default(distPatterns, {
                    dot: true,
                    absolute: true,
                    onlyFiles: false
                });

                // console.info('Files to be cleaned up:', files);

                for (const file of files) {
                    try {
                        if (fs.default.existsSync(file)) {
                            const stat = fs.default.statSync(file);
                            if (stat.isDirectory()) {
                                fs.default.rmSync(file, { recursive: true });
                            } else {
                                fs.default.unlinkSync(file);
                            }
                            console.log(`Cleaned up: ${file}`);
                        }
                    } catch (error) {
                        console.error(`Failed to clean up ${file}:`, error);
                    }
                }
            }
        }
    };
}

/**
 * 让 tldraw 在本地 loopback 地址下也视为开发环境。
 *
 * SiYuan 3.7 dev14 会以 https://127.0.0.1 打开插件页面，
 * 而 tldraw 默认只把 localhost 视作开发环境，导致 Hobby License
 * 被当成生产环境校验。这个构建后补丁只替换 tldraw 的开发判断，
 * 不改 SiYuan 源码。
 */
function patchTldrawLoopbackDev() {
    const targetPattern = /window\.location\.hostname===["']localhost["']/g;
    const replacement = '["localhost","127.0.0.1","::1"].includes(window.location.hostname.toLowerCase())';

    return {
        name: 'patch-tldraw-loopback-dev',
        enforce: 'post' as const,
        async writeBundle() {
            const filePath = resolve(__dirname, outputDir, 'index.js');

            try {
                const code = await fs.readFile(filePath, 'utf8');
                const patched = code.replace(targetPattern, replacement);

                if (patched !== code) {
                    await fs.writeFile(filePath, patched, 'utf8');
                    console.log(`[patch-tldraw-loopback-dev] patched ${filePath}`);
                } else {
                    console.warn(`[patch-tldraw-loopback-dev] no tldraw localhost check found in ${filePath}`);
                }
            } catch (error) {
                console.warn(`[patch-tldraw-loopback-dev] failed for ${filePath}`, error);
            }
        }
    };
}
