import {createPlugin } from '@fullcalendar/core';

const CustomViewConfig = {
    classNames: ['custom-view'],

    content: function (props) {
        console.log('custom view props', props);
        const allEvents = props.eventStore.defs;
        console.log('custom view allEvents', allEvents);
        // let segs = sliceEvents(props, true); // allDay=true
        // console.log('custom view segs', segs);
        let html =`

        `

        return { html: html }
    },

    didMount: function (props) {
        console.log('custom view now loaded', props);
    },

    willUnmount: function (props) {
        console.log('about to change away from custom view', props);
    }
}

export default createPlugin({
    name: 'custom-view',
    views: {
        kanban: CustomViewConfig
    }
});