const { exec } = require("child_process");
const { checkCanPayloadInput } = require("../utils/check");
const { DATA_INDEX, DATA_LENGTH, CAN_BUS_INDEX, CAN_ID_INDEX } = require("../utils/constants");
const CommandExecutor = require("../utils/CommandExecutor");

module.exports = function (RED) {
    function ResponseNode(config) {
        RED.nodes.createNode(this, config);
        const client = RED.nodes.getNode(config.client);
        const node = this;
        const commandExecutor = new CommandExecutor("timeout", [0.5, "candump", client.can.interface]);
        node.on("input", function (msg) {
            try {
                const data = msg.payload;
                const { id, items: inputItems } = checkCanPayloadInput(data, node);

                commandExecutor.on("data", (stdType, data) => {
                    if (stdType === "stderr") {
                        node.error(`candump stderr: ${data}`);
                        return;
                    }
                    const lines = data.toString().split("\n");
                    lines.forEach((line) => {
                        if (!line) {
                            return;
                        }
                        try {
                            const items = line.split(" ").filter((e) => e !== "");
                            if (items.length < DATA_INDEX + DATA_LENGTH) {
                                return;
                            }
                            if (items[CAN_BUS_INDEX] !== client.can.interface) {
                                return;
                            }
                            if (items[CAN_ID_INDEX] !== id) {
                                return;
                            }
                            if (inputItems[0] !== items[DATA_INDEX]) {
                                return;
                            }
                            node.send({ payload: { id, data: items.slice(DATA_INDEX) } });
                        } catch (error) {
                            node.error(`Error: ${error.message}`);
                        }
                    });
                });
                commandExecutor.on("error", (error) => {
                    node.error(`candump error: ${error.message}`);
                });

                commandExecutor.start();

                exec(`cansend ${client.can.interface} ${data}`, (error, _, stderr) => {
                    if (error) {
                        node.error(`Error sending CAN message: ${error.message}`);
                        this.status({ fill: "red", shape: "ring", text: "Fail to send" });
                        return;
                    }
                    if (stderr) {
                        node.error(`Error sending CAN message: ${stderr}`);
                        this.status({ fill: "red", shape: "ring", text: "Fail to send" });
                        return;
                    }
                    this.status({ fill: "green", shape: "dot", text: "Connected" });
                });
            } catch (error) {
                this.status({ fill: "red", shape: "ring", text: error?.message ?? "Error" });
            }
        });

        node.on("close", function () {
            commandExecutor.close();
        });
    }

    RED.nodes.registerType("response", ResponseNode);
};
