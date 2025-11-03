<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';

	export let group: string;
	export let key: string; // setting key
	export let value: any;  // stored as string/array/object

	type NB = { id: string; name: string };
	const dispatch = createEventDispatcher();

	let notebooks: NB[] = [];
		let selectedIds = new Set<string>(); // store by notebook id

		function parseInitial(v: any) {
			if (!v) return;
			const tokens: string[] = [];
			try {
				if (typeof v === 'string') {
					const s = v.trim();
					if (!s) return;
					try {
						const parsed = JSON.parse(s);
						if (Array.isArray(parsed)) parsed.forEach(it => { if (it != null) tokens.push(String(it)); });
						else if (parsed && typeof parsed === 'object') Object.keys(parsed).forEach(k => tokens.push(k));
						else tokens.push(s);
					} catch {
						s.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean).forEach(t => tokens.push(t));
					}
				} else if (Array.isArray(v)) {
					v.forEach(it => { if (it != null) tokens.push(String(it)); });
				} else if (typeof v === 'object') {
					Object.keys(v).forEach(k => tokens.push(k));
				}
			} catch { /* ignore */ }

			// Select notebooks that match any token by id or exact name (case-insensitive)
			for (const raw of tokens) {
				const t = String(raw).trim();
				if (!t) continue;
				const lower = t.toLowerCase();
				const byId = notebooks.find(n => n.id.toLowerCase() === lower);
				if (byId) { selectedIds.add(byId.id); continue; }
				const byName = notebooks.find(n => n.name.trim().toLowerCase() === lower);
				if (byName) { selectedIds.add(byName.id); continue; }
				// ignore tokens that don't match any known notebook
			}
		}

		function emitChange() {
			// Persist as newline-separated notebook IDs (only selected IDs)
			const arr = [...selectedIds.values()];
			const text = arr.join('\n');
			dispatch('changed', { group, key, value: text });
		}

	function toggleNotebook(id: string) {
		if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
		selectedIds = new Set(selectedIds);
		emitChange();
	}

		// custom entries removed; only notebook selection remains

	onMount(() => {
		try {
			const list = (window as any)?.siyuan?.notebooks;
			if (Array.isArray(list)) {
				notebooks = list.map((nb: any) => ({ id: String(nb.id || ''), name: String(nb.name || '') }));
			}
		} catch { /* ignore */ }
		parseInitial(value);
	});
</script>

<style>
	.nb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
	.nb-item { border: 1px solid var(--b3-border-color); border-radius: 6px; padding: 8px; display: flex; gap: 8px; align-items: flex-start; }
	.nb-id { font-size: 12px; color: var(--b3-theme-on-surface-light); word-break: break-all; }
		/* custom-entry chip styles removed (component now only supports selecting notebooks) */
</style>

<div class="fn__flex-1 fn__flex-column" style="gap:10px;">
	{#if notebooks.length > 0}
		<div class="nb-grid">
			{#each notebooks as nb}
				<label class="nb-item">
					<input type="checkbox" checked={selectedIds.has(nb.id)} on:change={() => toggleNotebook(nb.id)} />
					<div class="fn__flex-1" style="min-width:0;">
						<div style="font-weight:600;">{nb.name || '(未命名笔记本)'}</div>
						<div class="nb-id" title={nb.id}>{nb.id}</div>
					</div>
				</label>
			{/each}
		</div>
	{:else}
		<div class="b3-label" style="color:var(--b3-theme-on-surface-light);">未能获取笔记本列表，可直接在下方添加自定义条目。</div>
	{/if}

		<!-- Only notebook checkbox grid; custom entry UI removed -->
</div>

