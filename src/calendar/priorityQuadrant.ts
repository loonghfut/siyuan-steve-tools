import { createPlugin, sliceEvents } from '@fullcalendar/core';
import { NestedKBCalendarEvent, KBCalendarEvent } from './interface';
import * as myK from './myK';
import { settingdata } from '@/index';
import { changestatus_for_zq, showEvent } from './myF';
import { handleAddButtonClick, thisCalendars } from './kanban';
import Sortable from 'sortablejs';
import { run_changepriority } from './myK';
import { ScrollState } from './interface';

// 全局滚动状态存储（按日历元素区分）
type QuadrantScrollBundle = { board?: ScrollState; byQuadrant: Record<string, ScrollState> };
const quadrantScrollStore = new WeakMap<HTMLElement, QuadrantScrollBundle>();

// 计算紧急阈值（天）
const getUrgentThresholdDays = () => {
  const v = (settingdata as any)["cal-quadrant-urgent-days"];
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 2; // 默认2天内为紧急
};

let dataArray: NestedKBCalendarEvent[] = [];

// 简单防抖
function debounce<T extends (...args: any[]) => any>(fn: T, wait = 500) {
  let t: number | undefined;
  return (...args: Parameters<T>) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), wait);
  };
}

// 刷新四象限视图并恢复滚动位置（参考看板的实现）
const refreshQuadrant = debounce(async () => {
  const calendars = (thisCalendars || []).filter((c: any) => document.body.contains(c.el));
  if (!calendars.length) return;

  // 记录滚动位置
  calendars.forEach((calendar: any) => {
    try {
      // 总板滚动
      const board = calendar.el.querySelector('.priority-quadrant-view .quadrant-board') as HTMLElement | null;
      // 各象限列滚动
      const cols = calendar.el.querySelectorAll('.priority-quadrant-view .kanban-cards[data-quadrant]');
      const byQuadrant: Record<string, ScrollState> = {};
      cols.forEach((el: Element) => {
        const hel = el as HTMLElement;
        const q = hel.getAttribute('data-quadrant') || '';
        if (q) {
          byQuadrant[q] = { top: hel.scrollTop, left: hel.scrollLeft };
        }
      });
      // 保存到实例
      calendar['_quadrantScrollState'] = {
        board: board ? { top: board.scrollTop, left: board.scrollLeft } : { top: 0, left: 0 },
        byQuadrant,
      } as any;
      // 同步保存到全局存储
      quadrantScrollStore.set(calendar.el, {
        board: board ? { top: board.scrollTop, left: board.scrollLeft } : { top: 0, left: 0 },
        byQuadrant,
      });
    } catch (err) {
      console.error('保存四象限滚动位置失败:', err);
    }
  });

  // 顺序刷新并恢复滚动
  for (const calendar of calendars) {
    await new Promise<void>((resolve) => {
      calendar.refetchEvents();
    calendar.on('eventsSet', () => {
        try {
          const state = (calendar['_quadrantScrollState'] as any) || quadrantScrollStore.get(calendar.el);
          // 恢复总板滚动
          const board = calendar.el.querySelector('.priority-quadrant-view .quadrant-board') as HTMLElement | null;
          if (board && state?.board) {
            board.scrollTo({ top: state.board.top, left: state.board.left });
          }
          // 恢复各象限列滚动
          const cols = calendar.el.querySelectorAll('.priority-quadrant-view .kanban-cards[data-quadrant]');
          cols.forEach((el: Element) => {
            const hel = el as HTMLElement;
            const q = hel.getAttribute('data-quadrant') || '';
            const s = state?.byQuadrant?.[q];
            if (s) {
              hel.scrollTo({ top: s.top, left: s.left });
            }
          });
        } catch (err) {
          console.error('恢复四象限滚动位置失败:', err);
        }
        resolve();
      });
    });
  }
});

// 仅使用当前 events 构建嵌套，避免跨文件耦合
function convertEventsToNestedLocal(events: KBCalendarEvent[]): NestedKBCalendarEvent[] {
  const eventMap = new Map<string, NestedKBCalendarEvent>();
  events.forEach(e => eventMap.set(e.extendedProps.blockId, { ...e }));

  function buildNested(event: NestedKBCalendarEvent, depth = 0): NestedKBCalendarEvent {
    if (depth > 10) return event; // 深度保护
    if (event.extendedProps?.sub?.ids?.length) {
      event.children = (event.extendedProps.sub.ids as string[])
        .map((id: string) => eventMap.get(id))
        .filter(Boolean) as NestedKBCalendarEvent[];
      event.children = event.children.map(c => buildNested({ ...c }, depth + 1));
    }
    // 周期事件当天完成状态替换
    if (event.extendedProps?.isRecurring && event.extendedProps.source !== 'qqcalendar') {
      const okday = event.extendedProps.okday;
      if (okday) {
        const completedDates = okday.split(',').map(d => d.trim());
        const currentDateStr = event.range.start.toISOString().split('T')[0];
        event.extendedProps.status = completedDates.includes(currentDateStr) ? '完成' : '未完成';
      } else {
        event.extendedProps.status = '未完成';
      }
    }
    return event;
  }

  // 仅渲染顶层（未被引用）事件
  const referenced = new Set<string>();
//   events.forEach(e => e.extendedProps?.sub?.ids?.forEach((id: string) => referenced.add(id)));
  const tops = events.filter(e => !referenced.has(e.extendedProps.blockId));
  return myK.sortEvents(tops.map(e => buildNested({ ...e })));
}



function isUrgent(endOrStart: Date, status: string): boolean {
  if (status === '完成') return false;
  const now = new Date();
  const diffDays = Math.ceil((endOrStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const threshold = getUrgentThresholdDays();
  return diffDays <= threshold; // 包含过期（负数）
}

const QuadrantViewConfig = {
  classNames: ['priority-quadrant-view'],
  content: function (props) {
    // 提取并转换事件
    const filterEvents = sliceEvents(props, false);
    const flatEvents = myK.transformEventData_fr_filter(filterEvents) as KBCalendarEvent[];

    // 嵌套与周期事件处理
    dataArray = convertEventsToNestedLocal(flatEvents);

    // 过滤周期显示范围
    const showDoneRecurring = settingdata["cal-show-zq-done"]; // 兼容现有设置
    dataArray = myK.filterRecurringEvents(dataArray as any, {
      futureOccurrences: 1,
      pastOccurrences: 1,
      excludeStatuses: showDoneRecurring ? [] : ['完成']
    }) as any;

  // 过滤归档事件
  dataArray = dataArray.filter(e => e.extendedProps.status !== '归档');

    // 四象限分类：
    // 1) 先按优先级固定：高->q1，中->q2，低->q3，无->q4（确保q1含所有高，q3含所有低）
    // 2) 再按紧急度把 q2 推到 q1，把 q4 推到 q3（快过期/已过期场景）
    const Q1: NestedKBCalendarEvent[] = [];
    const Q2: NestedKBCalendarEvent[] = [];
    const Q3: NestedKBCalendarEvent[] = [];
    const Q4: NestedKBCalendarEvent[] = [];

    for (const e of dataArray) {
      const pri = e.extendedProps.priority || '无';
      let bucket: 'q1' | 'q2' | 'q3' | 'q4';
      if (pri === '高') bucket = 'q1';
      else if (pri === '中') bucket = 'q2';
      else if (pri === '低') bucket = 'q3';
      else bucket = 'q4';

      // 结束时间优先，其次开始时间
      const t = (e.range?.end as Date) || (e.range?.start as Date);
      const urg = isUrgent(t, e.extendedProps.status || '未完成');
      // 紧急时 q2->q1, q4->q3
      if (urg) {
        if (bucket === 'q2') bucket = 'q1';
        else if (bucket === 'q4') bucket = 'q3';
      }

      if (bucket === 'q1') Q1.push(e);
      else if (bucket === 'q2') Q2.push(e);
      else if (bucket === 'q3') Q3.push(e);
      else Q4.push(e);
    }

    const columns = {
      q1: myK.sortEvents(Q1),
      q2: myK.sortEvents(Q2),
      q3: myK.sortEvents(Q3),
      q4: myK.sortEvents(Q4),
    };

    const createCard = (event: NestedKBCalendarEvent) => {
      const childCards = event.children?.map(createCard).join('') || '';
      const endtime = event.range.end ? new Date(event.range.end).toLocaleString() : '';
      const statusLabel = event.extendedProps.status || '未完成';
      const nowToEndTime = event.range.end
        ? myK.getDaysFromNow(event.range.end, statusLabel)
        : myK.getDaysFromNow(event.extendedProps.Kstart, statusLabel);
  const isRecurring = event.extendedProps?.isRecurring;
    const titleStyle = statusLabel === '完成' ? 'text-decoration: line-through;' : '';
      return `
        <div class="kanban-card ${isRecurring ? 'recurring-event no-drag' : ''}" 
             data-id="${event.publicId}" 
             data-block-id="${event.extendedProps.blockId}"
             data-start-date="${event.range.start instanceof Date ? event.range.start.toISOString().split('T')[0] : ''}"
             ${isRecurring ? 'data-recurring="true"' : ''}>
          <div class="kanban-card-header">
            <h3>${isRecurring ?
              `<span>${event.title}</span>` :
             `<span class="st-ref" style="${titleStyle}" data-type="block-ref" data-id="${event.extendedProps.blockId}" data-subtype="d">${event.title}</span>`
            }
            ${isRecurring ? '<span class="recurring-icon" title="周期事件">🔄</span>' : ''}
            </h3>
            <div class="kanban-card-meta">
              <span class="kanban-nowToEndTime">${nowToEndTime}</span>
              <span class=\"kanban-status kanban-status-${statusLabel}\">${statusLabel}</span>
              ${event.extendedProps.category !== '无' ? `<span class="category">${event.extendedProps.category}</span>` : ''}
              ${event.extendedProps.priority && event.extendedProps.priority !== '无' ?
                `<span class="badge priority-${(event.extendedProps.priority as string).toLowerCase()}">${event.extendedProps.priority}</span>`
                : ''}
            </div>
          </div>
          <div class="kanban-card-content">
            ${endtime}
          </div>
          <div class="kanban-subcards">${childCards}</div>
        </div>
      `;
    };

    const createColumn = (title: string, events: NestedKBCalendarEvent[], key: string) => {
      const total = events.length;
      const done = events.filter(e => e.extendedProps.status === '完成').length;
      const percent = total ? Math.round((done / total) * 100) : 0;
      const icon = key === 'q1' ? '🔥' : key === 'q2' ? '⭐' : key === 'q3' ? '⏰' : '🌿';
      return `
      <div class="kanban-column quadrant-${key}">
        <div class="kanban-column-header quadrant-${key}-head">
          <h2>${icon} ${title} <span class="quadrant-stats">${done}/${total} (${percent}%)</span></h2>
          <button class="kanban-add-button" data-qkey="${key}">+</button>
        </div>
        <div class="kanban-cards" data-quadrant="${key}">
          ${events.map(createCard).join('')}
        </div>
      </div>`;
    };

    const html = `
      <div class="kanban-container">
        <div class="quadrant-board">
          ${createColumn('重要且紧急', columns.q1, 'q1')}
          ${createColumn('重要不紧急', columns.q2, 'q2')}
          ${createColumn('不重要但紧急', columns.q3, 'q3')}
          ${createColumn('不重要不紧急', columns.q4, 'q4')}
        </div>
      </div>
    `;

    // 点击交互：块引用、周期按钮、添加
  Promise.resolve().then(() => {
      requestAnimationFrame(() => {
  const containers = document.querySelectorAll('.priority-quadrant-view .quadrant-board');
    containers.forEach(container => {
          // 识别所属日历元素
          let calendarEl: HTMLElement | null = null;
          for (const cal of thisCalendars || []) {
            if (cal?.el && cal.el.contains(container)) { calendarEl = cal.el; break; }
          }
          // 渲染后立即按存储恢复列滚动
          if (calendarEl) {
            const saved = quadrantScrollStore.get(calendarEl);
            if (saved) {
              // 恢复列
              (container as HTMLElement).querySelectorAll('.kanban-cards[data-quadrant]').forEach((el: Element) => {
                const hel = el as HTMLElement;
                const q = hel.getAttribute('data-quadrant') || '';
                const s = saved.byQuadrant?.[q];
                if (s) hel.scrollTo({ top: s.top, left: s.left });
              });
            }
          }
          container.addEventListener('click', async (e: Event) => {
            const target = e.target as HTMLElement;
            // st-ref
            if (target.matches('.st-ref')) {
              e.preventDefault();
              e.stopPropagation();
              const blockId = target.getAttribute('data-id');
              if (blockId) showEvent(blockId, '', false, true);
            }
            // 周期标识
            if (target.matches('.recurring-icon')) {
              e.preventDefault();
              e.stopPropagation();
              const card = target.closest('.kanban-card');
              if (card) {
                const blockId = card.getAttribute('data-block-id');
                const startDate = card.getAttribute('data-start-date');
                const eventData = dataArray.find(e => e.extendedProps.blockId === blockId);
                if (eventData) changestatus_for_zq(eventData.extendedProps, startDate);
              }
            }
            // 添加
            if (target.matches('.kanban-add-button')) {
              e.preventDefault();
              e.stopPropagation();
              await handleAddButtonClick('未完成');
            }
          });
          // 点击状态文本，原位替换为内联选择框
          container.addEventListener('click', async (e: Event) => {
            const t = e.target as HTMLElement;
            const statusSpan = t.closest('.kanban-card-meta .kanban-status') as HTMLElement | null;
            if (!statusSpan) return;
            e.preventDefault();
            e.stopPropagation();
            const card = statusSpan.closest('.kanban-card') as HTMLElement | null;
            if (!card) return;
            const blockId = card.getAttribute('data-block-id') || '';
            const isRecurring = card.hasAttribute('data-recurring');
            const eventData = dataArray.find(e => e.extendedProps.blockId === blockId);
            if (!eventData) return;

            // 避免重复创建
            if (statusSpan.classList.contains('editing')) return;

            // 构造下拉
            const select = document.createElement('select');
            select.className = 'status-inline-select b3-text-field';
            const opts = isRecurring ? ['未完成', '完成'] : ['未完成', '进行中', '完成', '归档'];
            opts.forEach(s => {
              const op = document.createElement('option');
              op.value = s; op.textContent = s; if (s === (eventData.extendedProps.status || '未完成')) op.selected = true;
              select.appendChild(op);
            });
            // 原位显示下拉：隐藏原状态，插入下拉在其后
            statusSpan.classList.add('editing');
            const parent = statusSpan.parentElement as HTMLElement;
            statusSpan.style.display = 'none';
            parent?.insertBefore(select, statusSpan.nextSibling);
            select.focus();

            // 防止拖拽冲突
            select.addEventListener('pointerdown', ev => ev.stopPropagation(), { capture: true });
            select.addEventListener('mousedown', ev => ev.stopPropagation(), { capture: true });

            const cleanup = () => {
              try {
                if (select && select.isConnected) {
                  select.remove();
                }
                if (statusSpan) {
                  statusSpan.style.display = '';
                  statusSpan.classList.remove('editing');
                }
              } catch {}
            };
            const onBlur = () => { cleanup(); select.removeEventListener('blur', onBlur); };
            select.addEventListener('blur', onBlur, { once: true });

            select.addEventListener('keydown', (ke: KeyboardEvent) => {
              if (ke.key === 'Escape') { ke.preventDefault(); cleanup(); }
            });

            select.addEventListener('change', async () => {
              try {
                if (isRecurring) {
                  const cur = eventData.extendedProps.status || '未完成';
                  const chosen = select.value;
                  if (cur !== chosen) {
                    const startDate = card.getAttribute('data-start-date') || '';
                    changestatus_for_zq(eventData.extendedProps, startDate);
                  }
                } else {
                  const newStatus = select.value;
                  const payload = [{ content: newStatus }];
                  await myK.run_changestatus(eventData, payload);
                }
                refreshQuadrant();
              } catch (err) {
                console.error('inline status change error:', err);
              } finally {
                cleanup();
              }
            });
          });
    // 启用四象限之间拖拽：仅根据目标象限更新优先级（不改日期）
          container.querySelectorAll('.kanban-cards').forEach((col: Element) => {
            const el = col as HTMLElement;
            if (el.dataset.sortableInited === '1') return; // 防重复
            // 绑定列滚动监听，实时更新存储
            if (calendarEl && el.dataset.scrollBinded !== '1') {
              el.addEventListener('scroll', () => {
                const q = el.getAttribute('data-quadrant') || '';
                const exist = quadrantScrollStore.get(calendarEl!) || { byQuadrant: {} } as QuadrantScrollBundle;
                exist.byQuadrant = exist.byQuadrant || {} as any;
                exist.byQuadrant[q] = { top: el.scrollTop, left: el.scrollLeft };
                quadrantScrollStore.set(calendarEl!, exist);
              }, { passive: true });
              el.dataset.scrollBinded = '1';
            }
            Sortable.create(el, {
              group: { name: 'quadrant', pull: 'clone', put: true },
              sort: false,
              animation: 150,
              fallbackOnBody: true,
              swapThreshold: 0.65,
      scroll: true,
      scrollSensitivity: 10,
      scrollSpeed: 10,
              onClone: (evt) => {
                try { (evt.clone as HTMLElement).dataset.isClone = '1'; } catch {}
              },
              onEnd: async (evt) => {
                try {
                  const itemEl = evt.item as HTMLElement;
                  const isClone = itemEl?.dataset?.isClone === '1';
                  if (itemEl.classList.contains('no-drag')) {
                    // 不允许拖拽：仅移除克隆，否则复位
                    if (isClone) { itemEl.remove(); }
                    else if (evt.from && evt.oldIndex != null) {
                      const children = Array.from(evt.from.children);
                      const ref = children[Math.min(evt.oldIndex, children.length)];
                      evt.from.insertBefore(itemEl, ref || null);
                    }
                    return;
                  }
                  const blockId = itemEl.getAttribute('data-block-id');
                  const toQuadrant = (evt.to as HTMLElement).getAttribute('data-quadrant');
                  const fromQuadrant = (evt.from as HTMLElement).getAttribute('data-quadrant');
                  if (!blockId || !toQuadrant) return;
                  const eventData = dataArray.find(e => e.extendedProps.blockId === blockId);
                  if (!eventData) return;
      // 映射优先级：q1->高, q2->中, q3->低, q4->无
      const map: Record<string, string> = { q1: '高', q2: '中', q3: '低', q4: '无' };
      const newPriority = map[toQuadrant] || eventData.extendedProps.priority;
                  const noChange = newPriority === eventData.extendedProps.priority && toQuadrant === fromQuadrant;
                  if (noChange) {
                    // 未发生变化：移除克隆或将原元素复位
                    if (isClone) {
                      itemEl.remove();
                    } else if (evt.from && evt.oldIndex != null) {
                      const children = Array.from(evt.from.children);
                      const ref = children[Math.min(evt.oldIndex, children.length)];
                      evt.from.insertBefore(itemEl, ref || null);
                    }
                    return;
                  }
                  if (newPriority !== eventData.extendedProps.priority) {
                    await run_changepriority(eventData, newPriority);
        // 刷新并恢复滚动
        refreshQuadrant();
                  }
                  // 移除克隆元素，等待刷新
                  if (isClone) itemEl.remove();
                } catch (err) {
                  console.error('quadrant drag error', err);
                }
              }
            });
            el.dataset.sortableInited = '1';
          });
        });
      });
    });

    return { html };
  },
};

export default createPlugin({
  name: 'priority-quadrant-view',
  views: {
    priorityQuadrant: QuadrantViewConfig,
  },
});
