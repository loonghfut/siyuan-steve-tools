<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { getBlockByID } from '@/api/api';
  export let group: string;
  export let key: string;
  export let value: any; // stored as JSON string or object

  const dispatch = createEventDispatcher();

  type Row = { id: string; remote: string; localDir: string; title?: string; titleLoading?: boolean; titleErr?: string };
  let rows: Row[] = [];

  function parseInitial(): Row[] {
    try {
  const ensureRow = (id: string): Row => ({ id, remote: '', localDir: '', title: '', titleLoading: false, titleErr: '' });
      const rs: Row[] = [];
      const push = (r: Row) => { if (r.id) rs.push(r); };

      const handleVal = (id: string, val: any) => {
        const r = ensureRow(id);
        const pushOne = (x: string) => {
          const s = String(x).trim();
          if (!s) return;
          if (/^https?:\/\//i.test(s)) r.remote = s;
          else {
            // assets dir/file
            const t = s.replace(/^\/?data\//i, '').replace(/^\//, '');
            const withoutPrefix = t.replace(/^assets\//i, '');
            // simple heuristic: has image extension => file, else dir
            // 若识别为文件扩展，UI不再展示本地文件字段，这里忽略；统一鼓励配置目录用于随机与下载
            r.localDir = `assets/${withoutPrefix}`;
          }
        };
        if (Array.isArray(val)) val.forEach(pushOne);
        else if (val && typeof val === 'object') {
          if (val.urls) (Array.isArray(val.urls) ? val.urls : [val.urls]).forEach(pushOne);
          if (val.url) (Array.isArray(val.url) ? val.url : [val.url]).forEach(pushOne);
          if (val.dir) (Array.isArray(val.dir) ? val.dir : [val.dir]).forEach(pushOne);
          if (val.dirs) (Array.isArray(val.dirs) ? val.dirs : [val.dirs]).forEach(pushOne);
          // 兼容历史：如果用户之前存过 file/files，也聚合到目录字段，UI不再区分
          if (val.file) (Array.isArray(val.file) ? val.file : [val.file]).forEach(pushOne);
          if (val.files) (Array.isArray(val.files) ? val.files : [val.files]).forEach(pushOne);
        } else if (typeof val === 'string') pushOne(val);
        push(r);
      };

  let obj: any = value;
      if (typeof obj === 'string') {
        const s = obj.trim();
        try { obj = JSON.parse(s); } catch { /* ignore, treat as empty */ obj = {}; }
      }
      if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([id, v]) => handleVal(String(id), v));
      }
      return rs;
    } catch { return []; }
  }

  function emitChange() {
    const out: Record<string, any> = {};
    const push = (id: string, v: string) => {
      (out[id] ||= []);
      out[id].push(v);
    };
    rows.forEach(r => {
      const id = r.id?.trim();
      if (!id) return;
      if (r.remote?.trim()) push(id, r.remote.trim());
      if (r.localDir?.trim()) push(id, r.localDir.trim());
    });
    const json = JSON.stringify(out);
    dispatch('changed', { group, key, value: json });
  }

  function addRow() { rows = [...rows, { id: '', remote: '', localDir: '' }]; }
  function removeRow(i: number) { rows = rows.filter((_, idx) => idx !== i); emitChange(); }

  onMount(async () => {
    rows = parseInitial();
    if (rows.length === 0) addRow();
    // fetch titles for existing rows with id
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]?.id?.trim()) {
        // don't await sequentially to avoid blocking UI for many rows; but keep spacing
        fetchTitleForRow(i).catch(() => {});
      }
    }
  });

  // Fetch title for a specific row index (by document/block id)
  async function fetchTitleForRow(i: number) {
    const id = rows[i]?.id?.trim();
    if (!id) {
      rows[i] = { ...rows[i], title: '', titleErr: '', titleLoading: false };
      rows = [...rows];
      return;
    }
    rows[i] = { ...rows[i], titleLoading: true, titleErr: '' };
    rows = [...rows];
    try {
      const block = await getBlockByID(id);
      let title = '';
      if (block) {
        // 如果是文档（type === 'd'），优先使用 fcontent 字段作为标题
        if (block.type === 'd' && block.fcontent) {
          title = String(block.fcontent || '').trim();
        } else {
          title = block.name || '';
          if (!title && block.markdown) {
            // try to extract first meaningful line from markdown
            const firstLine = String(block.markdown || '').split('\n').map(s => s.trim()).find(l => l.length > 0) || '';
            title = firstLine.replace(/^#+\s*/, '').slice(0, 200);
          }
        }
        // 如果 block.ial 中包含 custom-st-head-url 或 custom-st-head-assets，则自动填充远程 URL 和本地目录（仅在对应字段为空时）
        if (block.ial && typeof block.ial === 'string') {
          try {
            let changed = false;
            const urlMatch = block.ial.match(/custom-st-head-url\s*=\s*"([^"]*)"/);
            const assetsMatch = block.ial.match(/custom-st-head-assets\s*=\s*"([^"]*)"/);
            if (urlMatch && urlMatch[1]) {
              const headUrl = String(urlMatch[1]).trim();
              if (headUrl && !(rows[i]?.remote?.trim())) {
                rows[i] = { ...rows[i], remote: headUrl };
                changed = true;
              }
            }
            if (assetsMatch && assetsMatch[1]) {
              const headAssets = String(assetsMatch[1]).trim();
              if (headAssets && !(rows[i]?.localDir?.trim())) {
                const t = headAssets.replace(/^\/?data\//i, '').replace(/^\//, '');
                const withoutPrefix = t.replace(/^assets\//i, '');
                const local = `assets/${withoutPrefix}`;
                rows[i] = { ...rows[i], localDir: local };
                changed = true;
              }
            }
            if (changed) {
              // 更新外层 rows 并触发保存
              rows = [...rows];
              emitChange();
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
      if (!title) {
        rows[i] = { ...rows[i], title: '', titleErr: '未找到标题', titleLoading: false };
      } else {
        rows[i] = { ...rows[i], title, titleErr: '', titleLoading: false };
      }
    } catch (e) {
      rows[i] = { ...rows[i], title: '', titleErr: '请求失败', titleLoading: false };
    }
    rows = [...rows];
  }
</script>

<div class="b3-label">
  <div class="fn__flex-1 fn__flex-column">
    {#each rows as r, i}
      <div class="fn__flex" style="gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap;">
        <input class="b3-text-field" style="width: 200px;" placeholder="文档ID"
          bind:value={r.id} on:change={() => { emitChange(); fetchTitleForRow(i); }} on:blur={() => fetchTitleForRow(i)} />
        <div style="min-width:200px; max-width:400px; color:var(--b3-theme-on-surface);">
          {#if r.titleLoading}
            <span style="color:var(--b3-theme-muted);">加载标题...</span>
          {:else if r.titleErr}
            <span style="color:var(--b3-theme-error);">{r.titleErr}</span>
          {:else if r.title}
            <span title={r.title} style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{r.title}</span>
          {:else}
            <span style="color:var(--b3-theme-muted);">未填写或未找到标题</span>
          {/if}
        </div>
        <input class="b3-text-field" style="flex:1; min-width: 240px;" placeholder="远程URL（可选）"
          bind:value={r.remote} on:change={emitChange} />
        <input class="b3-text-field" style="width: 260px;" placeholder="本地目录（assets/... 或 /data/assets/...）"
          bind:value={r.localDir} on:change={emitChange} />
        <!-- 本地文件输入框已移除，统一使用目录作为随机与保存位置 -->
        <button class="b3-button b3-button--outline" on:click={() => removeRow(i)}>删除</button>
      </div>
    {/each}
    <div>
      <button class="b3-button" on:click={addRow}>新增一行</button>
    </div>
  </div>
</div>
