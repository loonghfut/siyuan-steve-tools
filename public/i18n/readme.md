思源支持的 i18n 文件范围，可以在控制台 `siyuan.config.langs` 中查看。以下是目前（2024-10-24）支持的语言方案：

The range of i18n files supported by SiYuan can be viewed in the console under `siyuan.config.langs`. Below are the language schemes currently supported as of now (October 24, 2024) :

```js
>>> siyuan.config.langs.map( lang => lang.name)
['de_DE', 'en_US', 'es_ES', 'fr_FR', 'he_IL', 'it_IT', 'ja_JP', 'pl_PL', 'ru_RU', 'zh_CHT', 'zh_CN']
```

在插件开发中，默认使用 JSON 格式作为国际化（i18n）的载体文件。


