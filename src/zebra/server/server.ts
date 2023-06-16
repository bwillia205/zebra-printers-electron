import * as cors from "cors";
import * as express from "express";
import { Server as httpServer } from "http";
import { Manager } from "../manager";

enum Header {
    ContentType = "x-application/zpl",
    DefaultPrinter = "x-default-printer",
    Printer = "x-printer",
    DefaultPrinterType = "x-printer-type"
}

export class Server {
    private express: express.Express = express();
    private server: httpServer;
    private manager: Manager;

    constructor(manager: Manager, port: number = 65533) {
        this.manager = manager;

        // Enable CORS
        this.express.use(cors());

        // Use Raw Parser
        this.express.use(
            express.raw({
                inflate: true,
                limit: "100kb",
                type: Header.ContentType,
            })
        );

        // Register handlers.
        this.register();

        // Start the server.
        this.start(port);
    }

    /**
     * Change the serving port on the fly.
     * @param port Port.
     */
    public changePort(port: number): void {
        this.server.close();
        this.start(port);
    }

    /**
     * Start the server.
     * @param port Port.
     */
    private start(port: number): void {
        this.server = this.express.listen(port, () =>
            console.log(`Started to listening on ${port}`)
        );
    }

    /**
     * Register the handlers.
     */
    private register(): void {
        // Handle the GET request.
        // this.express.get("/", (_, response) => {
        //     this.manager.deviceList
        //         .then((devices) => {
        //             const index = this.manager.findDefaultUSBDeviceIndex(devices);
        //             response.json({
        //                 selected: index,
        //                 devices,
        //             });
        //         })
        //         .catch((error) => response.status(500).send(error.toString()));
        // });

        // Handle the POST request.
        this.express.post("/", (request, response) => {
            const defaultPrinter = this.parseNumber(
                request.headers[Header.DefaultPrinter]
            );
            const printerType: string = String(request.headers[Header.DefaultPrinterType]);
            const contentType = request.headers["content-type"];
            if (contentType !== Header.ContentType) {
                return response.status(400).send("Bad request");
            }

            // // if defaultPrinter is defined set the defualt printer.
            // if (defaultPrinter !== undefined) {
            //     this.manager
            //         .defaultDevice(defaultPrinter, printerType)
            //         .then(() => {
            //             response
            //                 .status(200)
            //                 .send("Default printer successfully set.");
            //         })
            //         .catch((error) => {
            //             response.status(500).send(`${error}`);
            //         });
            //     return;
            // }

            // if request body's length is greater than zero, try to print.
            if (request.body.length > 0) {
                const parsedBody = JSON.parse(request.body.toString());
                const labelString = parsedBody.zpl_data ? Buffer.from(parsedBody.zpl_data): request.body;
                const requestPrinter = this.parseNumber(
                    request.headers[Header.Printer]
                );

                this.manager
                    .transfer(labelString, requestPrinter, printerType)
                    .then(() => {
                        response.end();
                    })
                    .catch((error) => {
                        response.status(500).send(error.toString());
                    });

                return;
            } else {
                response.status(400).send("Body can not be blank.");
                return;
            }
        });
    }

    private parseNumber(value: any): number {
        value = parseInt(value, 10);
        return isNaN(value) ? undefined : value;
    }
}
