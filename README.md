STEVETOOLS
==========
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/releases)
[![GitHub stars](https://img.shields.io/github/stars/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/issues)
[![GitHub all releases](https://img.shields.io/github/downloads/loonghfut/siyuan-steve-tools/total)](https://github.com/loonghfut/siyuan-steve-tools/releases)

This is a personal toolkit collection. Why did I build so many features I don’t always use? Why spend countless nights maintaining features I may not need? (Reflection.) While I use it for myself, I also share it in case it helps others with similar needs.

All modules are open-source.

If you have technical skills, clone the repo and modify it yourself. If you don't, clone the repo and ask an AI to help modify it.

Note: Because this is a personal-use plugin, there may be imperfections and even data loss risks (it uses APIs that operate on SiYuan data). Please test carefully before using. If you encounter issues, report them.
If you mind potential risks, please do not use it.

Currently for my own use...

Free users: if you encounter problems, don't report them unless they affect my personal use — I’ll fix bugs that affect me. If a bug persists over several releases, please fork and fix it yourself. If you donated, you can report bugs and I'll try to prioritize them. You can also request personal features — if they're simple I might implement them.

To facilitate communication with donors, I created a temporary feedback QQ group (may be dissolved anytime). Please fill in the application form before joining: https://www.kdocs.cn/wo/sl/v1lC0R0

Available features (see plugin demos and tutorials at https://ld246.com/search?q=sttools):
1. Interconnected schedule management: deeply integrates with SiYuan to provide calendar views, generate .ics calendar files for syncing with calendar apps via URL subscription (Thunderbird, Xiaomi Calendar, Apple Calendar, etc.), and basic integration with TickTick. (Demo and tutorials linked in the original README.)
2. Docker sync awareness: Windows S3 synchronization is detected by the Docker side.
3. AI web sidebar: embeds several AI web pages for convenient use.
4. Media compression: compress media before importing into SiYuan.
5. tldraw whiteboard: similar to AFFINE, tightly integrated with SiYuan. Supports embedding SiYuan blocks and link navigation.
6. Lifelog: open-source alternative (for a better experience, consider YeGui plugin). Implemented via PR by BoysFight.
7. WPS integration: embed, preview, edit, and sync office files in SiYuan; import spreadsheet-like data and upload images.
8. Aggregation queries: visual SQL builder to query the SiYuan database with multiple filters and sorting, preview results and embed them as blocks; visual chart generator based on DB/SQL queries.

Powered by donations and stars.

Changelog:

### v0.20.7 (2025-11-05)
- feat(minutiae): add background image functionality and settings (loonghfut)
- feat(minutiae): allow skipping background refresh when updating settings (loonghfut)
- feat(minutiae): update background switch mode description to support persistent option (loonghfut)
- optimize image switching logic (loonghfut)
- feat(minutiae): add debounce threshold setting for background switching to optimize image request frequency (loonghfut)
- feat(minutiae): refresh background in startup mode to improve loading experience (loonghfut)
- feat(plugin): bump version to 0.20.0 (loonghfut)
- docs: update changelog for v0.20.0 (loonghfut)
- feat(minutiae): prohibit refreshing background when settings change to keep current image (loonghfut)
- feat(plugin): bump version to 0.20.1 (loonghfut)
- docs: update changelog for v0.20.1 (loonghfut)
- optimize shortcut addition to schedule (loonghfut)
- feat(calendar): add auto-adjust calendar height feature (loonghfut)
- tidy some files (loonghfut)
- feat(calendar): add "unscheduled events" panel and related features (loonghfut)
- style(calendar): adjust layout and styles for unscheduled events panel (loonghfut)
- refactor(calendar): encapsulate unscheduled panel logic into a controller and optimize event handling (loonghfut)
- chore(plugin): bump version to 0.20.2 (loonghfut)
- docs: update changelog for v0.20.2 (loonghfut)
- feat(calendar): add support for "overdue incomplete" events and update related APIs and logic (loonghfut)
- feat(calendar): consider "completed" and "archived" as done, improving event status logic (loonghfut)
- feat(calendar): update right-side view button settings and add "This Month Board" title, optimize button list (loonghfut)
- feat(ai): add user-customizable AI address list support and update relevant settings and logic (loonghfut)
- feat(plugin): bump version to 0.20.3 (loonghfut)
- docs: update changelog for v0.20.3 (loonghfut)
- feat(calendar): dynamically adjust timeGrid view slotMinTime to improve event display range (loonghfut)
- feat(calendar): update time grid view buttons and add planning button to improve UX (loonghfut)
- fix(styles): forcibly set border styles to none to resolve style conflicts (loonghfut)
- feat(plugin): bump version to 0.20.4 (loonghfut)
- docs: update changelog for v0.20.4 (loonghfut)
- refactor(api): comment out debug logs to clean console output; refactor(calendar): comment out debug logs to reduce noise; feat(calendar): add custom attribute settings to support event status updates (loonghfut)
- feat(aggregate): add SQL aggregator edit functionality to improve UX (loonghfut)
- feat(settings): add notebook blacklist to prevent automatic cover image setting (loonghfut)
- feat(settings): add notebook blacklist editor to improve cover image settings (loonghfut)
- feat(plugin): bump version to 0.20.5 and add random cover background info to the description (loonghfut)
- docs: update changelog for v0.20.5 (loonghfut)
- fix(plugin): correct plugin description and display language tags, add missing keywords (loonghfut)
- prepare i18n (loonghfut)
- docs(i18n): simplify i18n instructions in plugin development and remove YAML file related contents (loonghfut)
- feat(calendar): fix QQ Mail calendar events being non-editable (loonghfut)
- feat(network-interceptor): add lightweight fetch interceptor to listen to /api/av/* requests (loonghfut)
- fix(plugin): bump version to 0.20.6 (loonghfut)
- docs: update changelog for v0.20.6 (loonghfut)
- update copy (loonghfut)
- feat(transaction-listener): add front-end network request listener to synchronize status column changes (loonghfut)
- refactor(network-interceptor): update interceptor logic to support multiple independent listeners and improve performance; refactor(dida-serv): use independent intercept handles instead of global mute control for network interception; refactor(transaction-listener): optimize property setting logic for status and priority columns (loonghfut)
- feat(reminders): add default reminder settings, support multiple formats parsing and inject tasks (loonghfut)
- feat(dida): add request tagging to optimize network interception handling (loonghfut)
- chore(plugin): bump version to 0.20.7 (loonghfut)

For more details see the commit history: https://github.com/loonghfut/siyuan-steve-tools/commits/main-2/

Thanks to:
- Frostime: plugin template and development toolkit
- seanduo: PR contributor
- BoysFight: PR contributor for lifelog feature

Disclaimer:
- This plugin may risk data loss (documented in the plugin description). Test before use. The author is not responsible for any consequences from usage.
- Do not use this product for illegal activities. The author is not responsible for any results arising from misuse.
