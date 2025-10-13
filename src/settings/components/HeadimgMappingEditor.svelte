<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  export let group: string;
  export let key: string;
  export let value: any; // stored as JSON string or object

  const dispatch = createEventDispatcher();

  type Row = { id: string; remote: string; localDir: string };
  let rows: Row[] = [];

  function parseInitial(): Row[] {
    try {
  const ensureRow = (id: string): Row => ({ id, remote: '', localDir: '' });
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

  onMount(() => { rows = parseInitial(); if (rows.length === 0) addRow(); });
</script>

<div class="b3-label">
  <div class="fn__flex-1 fn__flex-column">
    {#each rows as r, i}
      <div class="fn__flex" style="gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap;">
        <input class="b3-text-field" style="width: 200px;" placeholder="文档ID"
          bind:value={r.id} on:change={emitChange} />
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
