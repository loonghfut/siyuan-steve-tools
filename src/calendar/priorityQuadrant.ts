import { createPlugin, sliceEvents } from '@fullcalendar/core';
import { NestedKBCalendarEvent, KBCalendarEvent } from './interface';
import * as myK from './myK';
import { settingdata } from '@/index';
import { changestatus_for_zq, showEvent } from './myF';
import { handleAddButtonClick } from './kanban';
import Sortable from 'sortablejs';
import { run_changepriority } from './myK';

// 计算紧急阈值（天）
const getUrgentThresholdDays = () => {
  const v = (settingdata as any)["cal-quadrant-urgent-days"];
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 2; // 默认2天内为紧急
};

let dataArray: NestedKBCalendarEvent[] = [];

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
      const nowToEndTime = event.range.end
        ? myK.getDaysFromNow(event.range.end, event.extendedProps.status)
        : myK.getDaysFromNow(event.extendedProps.Kstart, event.extendedProps.status);
      const isRecurring = event.extendedProps?.isRecurring;
      return `
        <div class="kanban-card ${isRecurring ? 'recurring-event no-drag' : ''}" 
             data-id="${event.publicId}" 
             data-block-id="${event.extendedProps.blockId}"
             data-start-date="${event.range.start instanceof Date ? event.range.start.toISOString().split('T')[0] : ''}"
             ${isRecurring ? 'data-recurring="true"' : ''}>
          <div class="kanban-card-header">
            <h3>${isRecurring ?
              `<span>${event.title}</span>` :
              `<span class="st-ref" data-type="block-ref" data-id="${event.extendedProps.blockId}" data-subtype="d">${event.title}</span>`
            }
            ${isRecurring ? '<span class="recurring-icon" title="周期事件">🔄</span>' : ''}
            </h3>
            <div class="kanban-card-meta">
              <span class="kanban-nowToEndTime">${nowToEndTime}</span>
              <span class="kanban-status-${event.extendedProps.status}">${event.extendedProps.status}</span>
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
    // 启用四象限之间拖拽：仅根据目标象限更新优先级（不改日期）
          container.querySelectorAll('.kanban-cards').forEach((col: Element) => {
            const el = col as HTMLElement;
            if (el.dataset.sortableInited === '1') return; // 防重复
            Sortable.create(el, {
              group: { name: 'quadrant', pull: 'clone', put: true },
              sort: false,
              animation: 150,
              fallbackOnBody: true,
              swapThreshold: 0.65,
              onEnd: async (evt) => {
                try {
                  const itemEl = evt.item as HTMLElement;
      if (itemEl.classList.contains('no-drag')) { itemEl.remove(); return; }
                  const blockId = itemEl.getAttribute('data-block-id');
                  const toQuadrant = (evt.to as HTMLElement).getAttribute('data-quadrant');
                  if (!blockId || !toQuadrant) return;
                  const eventData = dataArray.find(e => e.extendedProps.blockId === blockId);
                  if (!eventData) return;
      // 映射优先级：q1->高, q2->中, q3->低, q4->无
      const map: Record<string, string> = { q1: '高', q2: '中', q3: '低', q4: '无' };
      const newPriority = map[toQuadrant] || eventData.extendedProps.priority;
                  if (newPriority !== eventData.extendedProps.priority) {
                    await run_changepriority(eventData, newPriority);
                  }
                  // 移除克隆元素，等待刷新
                  itemEl.remove();
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
