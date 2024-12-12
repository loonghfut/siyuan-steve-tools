import steveTools from "@/index";
import { createEvents, EventAttributes } from 'ics';
import * as api from "@/api"

const events: EventAttributes[] = [
    {
        start: [2024, 12, 22, 10, 0],
        duration: { hours: 1, minutes: 30 },
        title: 'Meeting with Bob',
        description: 'Discuss project updates',
        location: 'Office',
        // url: 'http://example.com',
        status: 'CONFIRMED',
        busyStatus: 'BUSY',
        // organizer: { name: 'Alice', email: 'alice@example.com' },
        attendees: [
            { name: 'Bob', email: 'bob@example.com' }
        ]
    },
    {
        start: [2024, 12, 21, 14, 0],
        duration: { hours: 2, minutes: 3 },
        title: 'Lunch with Sarah',
        description: 'Catch up with Sarah',
        location: 'Restaurant',
        // url: 'http://example.com',
        status: 'CONFIRMED',
        busyStatus: 'BUSY',
        // organizer: { name: 'Alice', email: 'alice@example.com' },
        attendees: [
            { name: 'Sarah', email: 'sarah@example.com' }
        ]
    },
    {
        start: [2024, 12, 23, 14, 0],
        duration: { hours: 2, minutes: 3 },
        title: 'Lunch with Sarah222',
        description: 'Catch up with Sarah',
        location: 'Restaurant',
        // url: 'http://example.com',
        status: 'CONFIRMED',
        busyStatus: 'BUSY',
        // organizer: { name: 'Alice', email: 'alice@example.com' },
        attendees: [
            { name: 'Sarah', email: 'sarah@example.com' }
        ]
    }
];

export class M_calendar {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }
    init() {
        console.log("ModuleB initialized");
//         this.plugin.addIcons(`<symbol id="iconFace" viewBox="0 0 32 32">
//             <path d="M13.667 "></path>
//             </symbol>
// `);
        this.plugin.addTopBar({
            icon: "iconSearch",
            title: "SteveTools",
            position: "right",
            callback: () => {
                this.doSomethingElse();
                this.generateICS(events, 'data/public/stevetools/calendar.ics');
            }
        });
    }
    doSomethingElse() {
        console.log("ModuleB is doing something else");
    }
    onunload() {
        console.log("M_calendar unloaded");
    }
    async generateICS(events: EventAttributes[], filePath: string) {
        try {
            // 使用ics库生成ICS内容
            const { error, value: icsContent } = createEvents(events);
    
            if (error) {
                console.error('生成ICS内容时出错：', error);
                return;
            }
    
            // 将ICS内容转换为Blob
            const fileBlob = new Blob([icsContent], { type: 'text/calendar' });
    
            // 使用api.putFile上传文件
            const response = await api.putFile(filePath, false, fileBlob);
            this.plugin.outlog(response);
        } catch (error) {
            console.error('上传ICS文件时出错：', error);
        }
    }
}