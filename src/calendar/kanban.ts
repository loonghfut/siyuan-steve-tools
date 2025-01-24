import { createPlugin } from '@fullcalendar/core';
import * as way from './kanban_way';

const CustomViewConfig = {
    classNames: ['custom-view'],

    content: function (props) {
        // console.log('custom view props', props);
        const allEvents = props.eventStore.defs;
        console.log('custom view allEvents', allEvents);
        const dataArray = convertToArray(allEvents);
        console.log('custom view dataArray', dataArray);
        const columns = {
            todo: dataArray.filter(e => e.extendedProps.status === '未完成'),
            inProgress: dataArray.filter(e => e.extendedProps.status === '进行中'),
            done: dataArray.filter(e => e.extendedProps.status === '完成')
        };
        // let segs = sliceEvents(props, true); // allDay=true
        // console.log('custom view segs', segs);
        const html = `

        `;

        return { html: html }
    },

    didMount: function (props) {
        console.log('custom view now loaded', props);
        const container = document.querySelector('.container') as HTMLElement;
        if (container) {
            way.initKanban();
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