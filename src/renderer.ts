import { ipcRenderer } from 'electron';
import * as m from 'mithril';
import { Device, WifiDevice } from './zebra';

export interface IData {
    selected: number;
    list: Device[];
}
export interface WifiData {
    selected: number;
    list: WifiDevice[];
}
// App's root element.
const root = document.getElementById('app');

// Inform the main process.
ipcRenderer.send('renderer.ready');

ipcRenderer.on(
    'device.list',
    (event: Electron.IpcRendererEvent, data: IData) => {
        devices.data.selected = data.selected;
        devices.data.list = data.list;
        // Trigger mithril's redraw programmatically.
        m.redraw();
    }
);
ipcRenderer.on(
    'wifidevices.list',
    (event: Electron.IpcRendererEvent, data: WifiData) => {
        wifiDevices.data.selected = data.selected;
        wifiDevices.data.list = data.list;
        // Trigger mithril's redraw programmatically.
        m.redraw();
    }
);

ipcRenderer.on(
    'notification',
    (even: Electron.IpcRendererEvent, data: INotification) => {
        notifications.list.push(data);
        m.redraw();
    }
);

const devices = {
    data: {
        selected: null,
        list: [],
    } as IData,
    view: () => {
        return m(
            'ul.devices',
            devices.data.list.map((device, index) => {
                return m(
                    'li.device',
                    {
                        key: device.deviceAddress,
                        class:
                            index === devices.data.selected ? 'selected' : '',
                        onclick: () => {
                            ipcRenderer.send('device.set', index, 'usb');
                        },
                    },
                    device.deviceName
                );
            })
        );
    },
};
const wifiDevices = {
    data: {
        selected: null,
        list: [],
    } as WifiData,
    view: () => {
        return m(
            'ul.wifidevices',
            wifiDevices.data.list.map((device, index) => {
                return m(
                    'li.wifidevice',
                    {
                        key: device.ip,
                        class:
                            index === wifiDevices.data.selected ? 'selected' : '',
                        onclick: () => {
                            ipcRenderer.send('device.set', index, 'wifi');
                        },
                    },
                    `Name: ${device.name}
                    IP: ${device.ip}
                    MAC: ${device.mac}`
                );
            })
        );
    },
};

export interface INotification {
    class: string;
    content: string;
    duration: number;
}

const notification = {
    oninit: (vn: m.Vnode) => {
        const mvn = vn.attrs as INotification;
        if (mvn.duration > 0) {
            setTimeout(() => {
                notifications.remove(mvn);
            }, mvn.duration);
        }
    },
    view: (vn: m.Vnode) => {
        const mvn = vn.attrs as INotification;
        return m(
            'div.notification',
            {
                class: mvn.class,
                onclick: () => {
                    notifications.remove(mvn);
                },
            },
            mvn.content
        );
    },
};

const notifications = {
    list: [
        // {class: '', content: 'empty', duration: 0},
        // {class: 'yellow', content: 'yellow', duration: 2000},
        // {class: 'green', content: 'green', duration: 3000},
        // {class: 'blue', content: 'blue', duration: 4000},
        // {class: 'red', content: 'red', duration: 5000},
    ] as INotification[],
    remove: (el: INotification) => {
        const index = notifications.list.indexOf(el);
        notifications.list.splice(index, 1);
        m.redraw();
    },
    view: (): m.Vnode<any, any> => {
        return m(
            'div.notifications',
            notifications.list.map((e: INotification) => {
                return m(notifications, e);
            })
        );
    },
};

const body = {
    view: () => {
        return m('div.body', [
            m(notifications),
            [
                m(
                    'div.info',
                    'Select a default USB device to handle requests.'
                ),
                m('div.lds-ring', [m('div')]),
                m(devices),
            ],
            [
                m(
                    'div.info',
                    'Select a default WiFi device to handle requests.'
                ),
                m('div.lds-ring', [m('div')]),
                m(wifiDevices),
            ],
        ]);
    },
};

m.mount(root, body);
