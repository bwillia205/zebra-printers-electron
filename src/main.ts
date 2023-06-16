#!/bin/node
import {app, BrowserWindow, ipcMain, Menu, Tray} from "electron";
import * as log from "electron-log";
import {autoUpdater} from "electron-updater";
import * as path from "path";
import {IData, INotification, WifiData} from "./renderer";
import {Device, Manager, Server, WifiDevice} from "./zebra";

autoUpdater.logger = log;
log.info("App starting...");

const manager = new Manager();
const server = new Server(manager);

/**
 * A global value to detect if app.quit() fired via tray.
 */
let quittingViaTray: boolean = false;
const showConsole: boolean = Boolean(process.env.SHOW_CONSOLE);
// Global reference to main window.
let mainWindow: Electron.BrowserWindow;
let mainTray: Tray;

function createMainWindow() {
    const window = new BrowserWindow({
        webPreferences: {nodeIntegration: true, contextIsolation: false},
        title: "Octopus Operations PrintStation",
        width: 640,
        height: 640,
        fullscreenable: false,
        minimizable: true,
        resizable: false,
        autoHideMenuBar: true,
        alwaysOnTop: true,
        icon: path.join(__dirname, "../assets/icon/app.png"),
        // closable: false,
        // transparent: true,
        // frame: false,
    });

    window.loadFile(path.join(__dirname, "../app.html"));

    if (showConsole) {
        window.webContents.openDevTools({mode: "detach"});
    }
    window.on("close", (event) => {
        // Prevent the closing app directly, minimize to tray instead.
        if (!quittingViaTray) {
            event.preventDefault();
            window.hide();
        }
    });

    window.on("closed", () => {
        mainWindow = null;
    });

    return window;
}

/**
 * Builds the main tray.
 * @param updateAvailable Decide to show Update and Restart.
 */
function buildMainTray(updateAvailable: boolean = false) {
    // destroy old tray.
    if (mainTray !== undefined) {
        mainTray.destroy();
    }

    // Consider showing another icon for app states. This will require to destroy the mainTray in every state.
    const tray: Tray = new Tray(
        path.join(__dirname, "../assets/icon/app16x16.png")
    );

    const contextMenuItems: Electron.MenuItemConstructorOptions[] = [
        {enabled: false, label: `v${app.getVersion()}`},
        {
            label: "Check for Updates",
            click: () => {
                autoUpdater.checkForUpdatesAndNotify();
            },
        },
        {type: "separator"},
        {
            label: "Exit",
            click: () => {
                quittingViaTray = true;
                app.quit();
            },
        },
    ];

    if (updateAvailable) {
        const menuItem: Electron.MenuItemConstructorOptions = {
            label: "Update and Restart",
            click: () => {
                // Not silent, restart after update.
                autoUpdater.quitAndInstall(false, true);
            },
        };
        const seperator: Electron.MenuItemConstructorOptions = {
            type: "separator",
        };
        contextMenuItems.push(seperator, menuItem);
    }

    const contextMenu: Menu = Menu.buildFromTemplate(contextMenuItems);

    tray.setContextMenu(contextMenu);

    // On dblClick show-or-hide the main window.
    tray.on("double-click", () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });

    mainTray = tray;
}

app.on("ready", () => {
    autoUpdater.checkForUpdatesAndNotify();
    mainWindow = createMainWindow();
    buildMainTray();
});

// When the renderer is ready execute the updateRenderer.
ipcMain.on("renderer.ready", () => updateRenderer());

ipcMain.on("device.set", async (event: Electron.IpcMainEvent, index: number, type: string, uniqueIdentifier: string) => {
    console.log("device.set", index, type, uniqueIdentifier);
    mainWindow.webContents.send("blockSelection")
    try {
        manager.defaultDevice(index, uniqueIdentifier, type)
            .then(() => {
                mainWindow.webContents.send("unblockSelection");
            });
    } catch (error) {
        console.error(error)
        mainWindow.webContents.send("unblockSelection");
    }


});

ipcMain.on('wifidevices.refresh', () => {
    updateRenderer();
});

// Inform the renderer on any change on the manager.
manager.on("change", () => {
    updateRenderer();
});

manager.on("change:add", (device: Device) => {
    updateRenderer();
});

manager.on("change:default", (device: any) => {
    mainWindow.webContents.send("blockSelection");
    let wifiDevices: WifiDevice[] = [];
    manager.wifiDeviceList.then((list) => {
        wifiDevices = list;

        const wifiDevice = manager.findDefaultWifiDevice(wifiDevices);
        if (wifiDevice) {
            mainWindow.webContents.send("wifidevices.list", {
                selected: wifiDevice?.mac || null,
                list: wifiDevices,
            } as WifiData);
            mainWindow.webContents.send("unblockSelection");
        }
    });
});

async function updateRenderer() {
    // const usbDevices = await manager.deviceList;
    // const index = manager.findDefaultUSBDeviceIndex(usbDevices);
    // mainWindow.webContents.send("device.list", {
    //     selected: index,
    //     list: usbDevices,
    // } as IData);

    let wifiDevices: WifiDevice[] = [];
    manager.wifiDeviceList.then((list) => {
        wifiDevices = list;

        const wifiDevice = manager.findDefaultWifiDevice(wifiDevices);
        mainWindow.webContents.send("wifidevices.list", {
            selected: wifiDevice?.mac || null,
            list: wifiDevices,
        } as WifiData);
        mainWindow.webContents.send("allowActions");
        mainWindow.webContents.send("unblockSelection");
    });
}

autoUpdater.on("checking-for-update", () => {
    log.info("checking-for-update");
});

autoUpdater.on("update-available", (info) => {
    // tslint:disable-next-line: max-line-length
    sendNotification({
        class: "",
        content: `A new update is available and will be downloaded in the background. You will be notified when it's ready to install.`,
        duration: 0,
    });
    log.info("update-available" + info);
});

autoUpdater.on("error", (err) => {
    log.error(err);
});

autoUpdater.on("update-downloaded", (info) => {
    // tslint:disable-next-line: max-line-length
    sendNotification({
        class: "",
        content: `A new update is available to perform. Update will be performed when the app is restarted.`,
        duration: 0,
    });
    log.info("update-downloaded" + info);

    // Rebuild the main tray with an option to update and restart.
    buildMainTray(true);

    // log.info('Update will be performed when the app restarted.');
});

function sendNotification(notification: INotification) {
    if (mainWindow) {
        mainWindow.webContents.send("notification", notification);
    } else {
        console.log(notification);
    }
}
