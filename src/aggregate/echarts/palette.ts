export type GetColors = () => string[];
export type SetColors = (arr: string[]) => void;

export function renderPaletteFromState(
  paletteEl: HTMLElement | undefined,
  getColors: GetColors,
  setColors: SetColors,
  onMutating?: (fn: () => void) => void,
) {
  if (!paletteEl) return;
  const colors = getColors();
  if (!colors.length) {
    paletteEl.innerHTML = '<div class="ve-color-empty">未设置颜色，使用内置默认配色</div>';
    return;
  }
  paletteEl.innerHTML = colors
    .map(
      (c, i) => `
      <div class="ve-color-chip" data-idx="${i}">
        <span class="ve-color-swatch" style="background:${c}"></span>
        <button class="ve-color-del" title="删除" type="button">×</button>
        <input type="color" value="${c}" />
      </div>
    `,
    )
    .join('');

  Array.from(paletteEl.querySelectorAll('.ve-color-chip')).forEach((chip) => {
    const idx = Number((chip as HTMLElement).getAttribute('data-idx') || '0');
    const picker = chip.querySelector('input[type="color"]') as HTMLInputElement | null;
    const del = chip.querySelector('.ve-color-del') as HTMLButtonElement | null;
    const swatch = chip.querySelector('.ve-color-swatch') as HTMLElement | null;
    if (picker)
      picker.addEventListener('input', () => {
        const apply = () => {
          const cs = getColors();
          cs[idx] = picker.value;
          if (swatch) swatch.style.background = picker.value;
          setColors(cs);
        };
        onMutating ? onMutating(apply) : apply();
      });
    if (del)
      del.addEventListener('click', () => {
        const apply = () => {
          const cs = getColors();
          cs.splice(idx, 1);
          setColors(cs);
        };
        onMutating ? onMutating(apply) : apply();
        renderPaletteFromState(paletteEl, getColors, setColors, onMutating);
      });
  });
}
