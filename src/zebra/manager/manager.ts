import * as storage from "electron-json-storage";
import { EventEmitter } from "events";
import * as usb from "usb";
import * as usbDetection from "usb-detection";
const find = require('local-devices');
const XMLHttpRequest = require('xhr2');

export type Device = usbDetection.Device;
type Endpoint = usb.OutEndpoint;

interface IDevice {
    device: Device;
    endpoint: Endpoint;
}
export interface WifiDevice {
    name: string,
    ip: string,
    mac: string
}

const supportedVendors = [
    0xa5f, // Zebra
    2655,
    // 0xBDA,  // Test: Realtek
    // 0x4F2,  // Test: Standart USB Host Controller
];

export class Manager extends EventEmitter {
    private _usbDefault: IDevice;
    private _wifiDefault: WifiDevice;
    private _wifiDevices: WifiDevice[] = [];
    constructor() {
        super();

        // Start monitoring device list for upcoming changes such as attaching/removing.
        usbDetection.startMonitoring();

        // Mirror any changes on usbDetection to Manager.
        usbDetection.on("change", (device) => this.emit("change", device));

        usbDetection.on("add", (device) => this.emit("change:add", device));

        // On device remove, check if the removed device is default device. If so set it undefined.
        usbDetection.on("remove", (device) => {
            if (
                this._usbDefault &&
                this._usbDefault.device.deviceAddress === device.deviceAddress
            ) {
                this._usbDefault = undefined;
                storage.remove("default-usb-printer", (_) => null); // omit the error.
            }
            this.emit("change:remove", device);
        });

        storage.get("default-wifi-printer", (_, data: { id: number, type: 'wifi' }) => {
            this.defaultDevice(data.id, data.type).catch((error) => {
                console.log(error);
            }); // omit the error.
        });
        storage.get("default-usb-printer", (_, data: { id: number, type: 'usb' }) => {
            this.defaultDevice(data.id, data.type).catch((error) => {
                console.log(error);
            }); // omit the error.
        });
    }

    /**
     * List of attached usb devices filtered by supported vendors.
     */
    public get deviceList(): Promise<Device[]> {
        return new Promise((resolve, reject) => {
            usbDetection.find((error, devices) => {
                if (error !== undefined) {
                    reject();
                } else {
                    resolve(
                        devices.filter((device) => supportedVendors.indexOf(device.vendorId) !== -1)
                    );
                }
            });
        });
    }
    public get wifiDeviceList(): Promise<WifiDevice[]> {
        return new Promise((resolve, reject) => {
            if(this._wifiDevices.length === 0){
                try {
                    find().then((devices: WifiDevice[]) => {
                        resolve(devices);
                    })
                } catch (error) {
                    reject(error)
                }
            } else {
                resolve(this._wifiDevices);
            }

        });
    }

    /**
     * Set the default device.
     * @param index Device index in the attached devices.
     */
    public async defaultDevice(index: number, type?: string): Promise<any> {
        if(type === undefined){
            type = 'wifi';
        }
        if(type === 'usb'){
            try {
                const device = await this.getUSBDevice(index)
                this._usbDefault = device; // Set the default device.
                this.emit("change:default", device.device) // Inform the manager about this change.
                storage.set("default-usb-printer", { id: index }, (err) => {
                    if (err !== undefined) {
                        throw new Error(err);
                    }
                });
            } catch (error) {
                throw new Error(`Can't set the default device.\n${error}`)
            }

        } else if(type === 'wifi'){
            try {
                const device = await this.getWifiDevice(index)
                this._wifiDefault = device; // Set the default device.
                this.emit("change:default", device) // Inform the manager about this change.
                storage.set("default-wifi-printer", { id: index }, (err) => {
                    if (err !== undefined) {
                        throw new Error(err);
                    }
                });
            } catch (error) {
                throw new Error(`Can't set the default device.\n${error}`)
            }
        }
    }

    /**
     * Returns the default device's index in the given device list.
     * @param devices Currently attached device array.
     */
    public findDefaultUSBDeviceIndex(devices: Device[]): number {
        return devices.findIndex(
            (device) =>
                this._usbDefault &&
                this._usbDefault.device.deviceAddress === device.deviceAddress
        );
    }
    public findDefaultWifiDeviceIndex(devices: WifiDevice[]): number {
        return devices.findIndex(
            (device) =>
                this._wifiDefault &&
                this._wifiDefault.ip === device.ip
        );
    }
    /**
     * Transfers given data to device.
     *
     * Index can be omitted, in that case request will be directed to default device.
     * @param data Data to be transferred into device.
     * @param index Device index in the attached devices.
     */
    public async transfer(data: Buffer, index?: number, type?: string): Promise<any> {
        if(type === undefined){
            type = 'wifi';
        }
        if(type === 'usb'){
            try {
                const endpoint = await this.getUSBEndpoint(index)
                return endpoint.transfer(data, (error) => {
                    if (error !== undefined) {
                        throw error;
                    } else {
                        return data;
                    }
                });
            } catch (error) {
                throw new Error(`Failed to transfer, error: ${error}`);
            }
        } else if (type === 'wifi'){
            try {
                const ip = await this.getWifiEndpoint(index)
                const url = `http://{ip}:9100/`
                const method = "POST";
                const async = true;
                const request = new XMLHttpRequest();
                request.open(method, url, async);
                request.setRequestHeader("Content-Length", data.length.toString());
                request.send(data);
            } catch (error) {
                throw new Error(`Failed to transfer, error: ${error}`);
            }
        }

    }
    private async getUSBDevice(index: number): Promise<IDevice> {
        const devices = await this.deviceList;

        try {
            let device = devices.find((_, idx) => idx === index);       
            // Access the device via node-usb.
            const _device = usb.findByIds(
                device.vendorId,
                device.productId
            );
            if (!_device) {
                throw new Error("Device not found.");
            }
            _device.open();

            const _interface = _device.interface(0);

            if (!_interface) {
                _device.close();
                // tslint:disable-next-line: max-line-length
                throw new Error(
                    `Can not claim the device's interface. Device might be claimed by another program. Try to close it.`
                );
            }
            _interface.claim();

            const _endpoint = _interface
                .endpoints[1] as usb.OutEndpoint;
            return {
                device,
                endpoint: _endpoint,
            };
        } catch (error) {
            throw new Error(`Can not get the device.\n${error}`)
        }
    }
    /**
     * Get the device.
     * @param index Device index in the attached devices.
     */
     private async getWifiDevice(index: number): Promise<WifiDevice> {
            const wifiDevices = await this.wifiDeviceList;
            return wifiDevices[index];
    }
    private async getWifiEndpoint(index?: number): Promise<string> {
        if (index !== undefined) {
            return await this.getWifiDevice(index).then((device) => device.ip)
        } else {
            if (this._wifiDefault !== undefined) {
                return this._wifiDefault.ip;
            } else {
                // tslint:disable-next-line: max-line-length
                throw new Error(
                    `There isn't a device index given nor a default device set before to handle the request.\nPlease select a default device to handle upcoming requests or send a device index with the request.`
                );
            }
        }
    }
    /**
     * Get the endpoint.
     * @param index Device index in the attached devices.
     */
    private async getUSBEndpoint(index?: number): Promise<Endpoint> {
        if (index !== undefined) {
            return await this.getUSBDevice(index).then((device) => device.endpoint)
        } else {
            if (this._usbDefault !== undefined) {
                return this._usbDefault.endpoint;
            } else {
                // tslint:disable-next-line: max-line-length
                throw new Error(
                    `There isn't a device index given nor a default device set before to handle the request.\nPlease select a default device to handle upcoming requests or send a device index with the request.`
                );
            }
        }
    }
}
