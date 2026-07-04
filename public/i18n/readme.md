思源支持的 i18n 文件范围，可以在控制台 `siyuan.config.langs` 中查看。

自 SiYuan 3.7.0 起，界面语言标识从下划线形式（如 `zh_CN`）统一为符合 RFC 5646 的 BCP 47 形式（如 `zh-CN`）。i18n 文件名也应使用 BCP 47 命名（如 `zh-CN.json`、`en.json`）。

The range of i18n files supported by SiYuan can be viewed in the console under `siyuan.config.langs`.

Since SiYuan 3.7.0, the UI language identifier has been unified from the underscore form (e.g. `zh_CN`) to the RFC 5646 BCP 47 form (e.g. `zh-CN`). i18n filenames should also use BCP 47 (e.g. `zh-CN.json`, `en.json`).

```js
>>> siyuan.config.langs.map( lang => lang.name)
['de', 'en', 'es', 'fr', 'he', 'it', 'ja', 'pl', 'ru', 'zh-TW', 'zh-CN']
```

在插件开发中，默认使用 JSON 格式作为国际化（i18n）的载体文件。



