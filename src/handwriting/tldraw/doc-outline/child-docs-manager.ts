/**
 * 瀛愭枃妗ｉ潰鏉夸綅缃鐞?
 */

/**
 * 閲嶇疆瀛愭枃妗ｉ潰鏉夸綅缃埌榛樿浣嶇疆
 */
export function resetChildDocsPanelPosition() {
    const left = Math.max(12, window.innerWidth - 900);
    const top = 60;

    const event = new CustomEvent('childDocs:posReset', {
        detail: { left, top }
    });
    window.dispatchEvent(event);
}
