import {ipcRenderer} from 'electron';
import * as m from 'mithril';
import {Device, WifiDevice} from './zebra';

export interface IData {
    selected: number;
    list: Device[];
}

export interface WifiData {
    selected: string;
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
        m.redraw();
    }
);

ipcRenderer.on(
    'wifidevices.list',
    (event: Electron.IpcRendererEvent, data: WifiData) => {
        wifiDevices.data.selected = data.selected;
        wifiDevices.data.list = data.list;
        spinner.show = false;
        messageParagraph.text = " ";
        m.redraw();
    }
);

ipcRenderer.on(
    'notification',
    (event: Electron.IpcRendererEvent, data: INotification) => {
        notifications.list.push(data);
        m.redraw();
    }
);

ipcRenderer.on(
    'allowActions',
    (event: Electron.IpcRendererEvent) => {
        refreshButton.disabled = false;
        showAllButton.disabled = false;
        filterButton.disabled = false;
    }
);

ipcRenderer.on(
    'blockSelection',
    (event: Electron.IpcRendererEvent) => {
        wifiDevices.selectionBlocked = true;
    }
);

ipcRenderer.on(
    'unblockSelection',
    (event: Electron.IpcRendererEvent) => {
        wifiDevices.selectionBlocked = false;
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
                            ipcRenderer.send('device.set', index, 'usb', device.serialNumber);
                        },
                    },
                    device.deviceName
                );
            })
        );
    },
};
const wifiDevices = {
    showAll: false,
    data: {
        selected: null,
        list: [],
    } as WifiData,
    selectionBlocked: false,
    view: () => {
        let filteredData = wifiDevices.data.list;
        if (!wifiDevices.showAll) {
            const filters = Array.from(new Set(['zebra', 'printer']));

            // Check if the elements in filters are substring of the name
            filteredData = wifiDevices.data.list.filter(({name}) => filters.some((filter) => name.includes(filter)));

        }
        return m(
            'ul.wifidevices',
            filteredData.map((device, index) => {
                return m(
                    'li.wifidevice',
                    {
                        key: device.ip,
                        class:
                            device.mac === wifiDevices.data.selected ? 'selected' : '',
                        onclick: () => {
                            if (wifiDevices.selectionBlocked) {
                                messageParagraph.text = `${messageParagraph.text ? messageParagraph.text + '<br><br>' : ''}Please wait until the current operation is finished`;
                                return;
                            }
                            spinner.show = true;
                            messageParagraph.text = `Setting ${device.name} as default printer`;
                            ipcRenderer.send('device.set', index, 'wifi', device.mac);
                        },
                        innerHTML: `
<strong>${device.name}</strong><br>
<div class="flex-container justify-items">
    <div class="flex-item">
    IP: ${device.ip}
    </div>
    <div class="flex-item">
    MAC: ${device.mac}
    </div>
</div>`,
                    },
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
const spinner = {
    show: true,
    view: (): m.Vnode<any, any> => {
        if (spinner.show) {
            return m('div.spinner', [m('div')])
        }
        return m('div');
    },
}
const showAllButton = {
    disabled: true,
    view: (vn: m.Vnode) => {
        return m(
            'button#showAll',
            {
                disabled: showAllButton.disabled,
                onclick: () => {
                    wifiDevices.showAll = true;
                    m.redraw();
                },
            },
            'Show All'
        );
    },
}
const filterButton = {
    disabled: true,
    view: (vn: m.Vnode) => {
        return m(
            'button#filter',
            {
                disabled: filterButton.disabled,
                onclick: () => {
                    wifiDevices.showAll = false;
                    m.redraw();
                },
            },
            'Show Zebra Printers'
        );
    },
}
const refreshButton = {
    disabled: true,
    view: (vn: m.Vnode) => {
        return m(
            'button#refresh',
            {
                disabled: refreshButton.disabled,
                onclick: () => {
                    refreshButton.disabled = true;
                    showAllButton.disabled = true;
                    filterButton.disabled = true;
                    wifiDevices.data.selected = null;
                    wifiDevices.data.list = [];
                    spinner.show = true;
                    ipcRenderer.send('wifidevices.refresh');
                },
            },
            'Refresh'
        );
    }
}

// Add a paragraph view element to display dynamic text
const messageParagraph = {
    text: '',
    view: (vn: m.Vnode) => {
        return m('p.message',
            {
                innerHTML: messageParagraph.text,
            });
    }
}

const body = {
    view: () => {
        return m('div.body', [
            m(notifications),
            m(
                'div.note',
                m(
                    'small',
                    'Note: If you are using a Zebra printer, you will need to connect to the VPN before it will appear in the list.'
                )
            ),
            m(
                'div.button-container',
                [
                    m(showAllButton),
                    m(filterButton),
                    m(refreshButton),
                ],
            ),
            [
                m(messageParagraph),
            ],
            [
                m(
                    'div.info',
                    'Select a default WiFi device to handle requests.'
                ),
                m(spinner),
                m(wifiDevices),

            ],
        ]);
    },
};

m.mount(root, body);
