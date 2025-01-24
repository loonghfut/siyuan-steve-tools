import { createPlugin } from '@fullcalendar/core';
import Sortable from 'sortablejs';

interface KBCalendarEvent {
    title: string;
    publicId: string;
    extendedProps: {
        blockId: string;
        status: string;
        priority: string;
        category: string;
        rootid: string;
        description: string;
        parent: {
            contents: Array<{
                block: {
                    id: string;
                    content: string;
                }
            }>;
            ids: string[];
        };
        order: number;
    };
}

const CustomViewConfig = {
    classNames: ['custom-view'],

    content: function (props) {
        const allEvents = props.eventStore.defs;
        const dataArray = convertToArray(allEvents) as KBCalendarEvent[];
        const columns = {
            todo: dataArray.filter(e => e.extendedProps.status === '未完成'),
            inProgress: dataArray.filter(e => e.extendedProps.status === '进行中'),
            done: dataArray.filter(e => e.extendedProps.status === '完成')
        };
        console.log(columns);

        const createCard = (event: KBCalendarEvent) => `
            <div class="kanban-card" data-id="${event.publicId}">
                <h3>${event.title}</h3>
                <p>${event.extendedProps.description}</p>
                <p>Category: ${event.extendedProps.category}</p>
                <p>Priority: ${event.extendedProps.priority}</p>
                ${event.extendedProps.parent.contents.length > 0 ? `
                    <div class="kanban-subcards">
                        ${event.extendedProps.parent.contents.map(subEvent => createCard({
                            title: subEvent.block.content,
                            publicId: subEvent.block.id,
                            extendedProps: {
                                blockId: subEvent.block.id,
                                status: event.extendedProps.status,
                                priority: '',
                                category: '',
                                rootid: '',
                                description: subEvent.block.content,
                                parent: { contents: [], ids: [] },
                                order: 0
                            }
                        })).join('')}
                    </div>
                ` : '<div class="kanban-subcards"></div>'}
            </div>
        `;

        const createColumn = (title: string, events: KBCalendarEvent[]) => `
            <div class="kanban-column">
                <h2>${title}</h2>
                <div class="kanban-cards">
                    ${events.map(createCard).join('')}
                </div>
            </div>
        `;

        const html = `
            <div class="kanban-board">
                ${createColumn('未完成', columns.todo)}
                ${createColumn('进行中', columns.inProgress)}
                ${createColumn('完成', columns.done)}
            </div>
        `;

        return { html: html }
    },

    didMount: function (props) {
        const container = document.querySelector('.kanban-board') as HTMLElement;
        if (container) {
            const columns = container.querySelectorAll('.kanban-cards');
            columns.forEach(column => {
                Sortable.create(column as HTMLElement, {
                    group: 'kanban',
                    animation: 150,
                    fallbackOnBody: true,
                    swapThreshold: 0.65,
                    onEnd: function (evt) {
                        const itemEl = evt.item;
                        const parentEl = evt.to;
                        const newParentId = parentEl.closest('.kanban-card')?.getAttribute('data-id') || null;

                        if (newParentId) {
                            // 将事件变为子事件
                            console.log(`Item ${itemEl.getAttribute('data-id')} moved to be a child of ${newParentId}`);
                        } else {
                            // 将子事件变为主事件
                            console.log(`Item ${itemEl.getAttribute('data-id')} moved to be a main event`);
                        }
                    }
                });
            });

            const cards = container.querySelectorAll('.kanban-card');
            cards.forEach(card => {
                const subcards = card.querySelector('.kanban-subcards');
                if (subcards) {
                    Sortable.create(subcards as HTMLElement, {
                        group: 'kanban',
                        animation: 150,
                        fallbackOnBody: true,
                        swapThreshold: 0.65,
                        onEnd: function (evt) {
                            const itemEl = evt.item;
                            const parentEl = evt.to;
                            const newParentId = parentEl.closest('.kanban-card')?.getAttribute('data-id') || null;

                            if (newParentId) {
                                // 将事件变为子事件
                                console.log(`Item ${itemEl.getAttribute('data-id')} moved to be a child of ${newParentId}`);
                            } else {
                                // 将子事件变为主事件
                                console.log(`Item ${itemEl.getAttribute('data-id')} moved to be a main event`);
                            }
                        }
                    });
                }
            });
        }
    },

    willUnmount: function (props) {
        console.log('about to change away from custom view', props);
    }
}

function convertToArray(data: Record<string, any>): any[] {
    return Object.values(data);
}

export default createPlugin({
    name: 'custom-view',
    views: {
        kanban: CustomViewConfig
    }
});