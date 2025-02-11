import { createClient } from 'webdav';

export class CalDAVClient {
    private client;
    private baseUrl: string;
    private credentials: {
        username: string;
        password: string;
    };

    constructor(username: string, password: string) {
        this.baseUrl = 'https://wx.mail.qq.com/caldav/';
        this.credentials = {
            username, // QQ邮箱完整地址
            password  // 邮箱授权码，不是QQ密码
        };

        this.client = createClient(this.baseUrl, {
            username: this.credentials.username,
            password: this.credentials.password
        });
    }

    async getCalendars() {
        try {
            // 使用 PROPFIND 请求获取日历列表
            const response = await fetch(this.baseUrl, {
                method: 'PROPFIND',
                headers: {
                    'Content-Type': 'application/xml; charset=utf-8',
                    'Depth': '1',
                    'Authorization': 'Basic ' + btoa(this.credentials.username + ':' + this.credentials.password)
                },
                body: `<?xml version="1.0" encoding="utf-8" ?>
                       <D:propfind xmlns:D="DAV:">
                           <D:prop>
                               <D:resourcetype/>
                               <D:displayname/>
                           </D:prop>
                       </D:propfind>`
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.text();
            console.log('CalDAV Response:', data);
            return data;
        } catch (error) {
            console.error('获取日历列表失败:', error);
            throw error;
        }
    }
}