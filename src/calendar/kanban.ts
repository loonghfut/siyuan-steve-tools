import { sliceEvents, createPlugin } from '@fullcalendar/core';

const CustomViewConfig = {
    classNames: ['custom-view'],

    content: function (props) {
        console.log('custom view props', props);
        let segs = sliceEvents(props, true); // allDay=true
        let html =
            '<div class="view-title">' +
            props.dateProfile.currentRange.start.toUTCString() +
            '</div>' +
            '<div class="view-events">' +
            segs.length + ' events' +
            '</div>'

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