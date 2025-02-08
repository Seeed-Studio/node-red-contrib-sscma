const { exec } = require("child_process");
const { checkCanPayloadInput } = require("../utils/check");
const { DATA_INDEX, DATA_LENGTH, CAN_BUS_INDEX, CAN_ID_INDEX } = require("../utils/constants");
const CommandExecutor = require("../utils/CommandExecutor");

module.exports = function (RED) {
    let timer = null;
    function cleanTimer() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }
    function ResponseNode(config) {
        RED.nodes.createNode(this, config);
        const client = RED.nodes.getNode(config.client);
        const node = this;
        const commandExecutor = new CommandExecutor("timeout", [0.5, "candump", client.can.interface]);
        node.on("input", function (msg) {
            try {
                const data = msg.payload;
                const sendCommandParam = `${client.can.interface} ${data}`;
                const { id, items: inputItems } = checkCanPayloadInput(data, node);
                let receiveData = [];
                commandExecutor.on("data", (stdType, data) => {
                    if (stdType === "stderr") {
                        node.error(`candump stderr: ${data}`);
                        return;
                    }
                    const lines = data.toString().trim().split("\n");
                    lines.forEach((line) => {
                        if (!line) {
                            return;
                        }
                        const items = line.split(" ").filter((e) => e !== "");
                        const isValidData =
                            items.length >= DATA_INDEX + DATA_LENGTH &&
                            items[CAN_BUS_INDEX] === client.can.interface &&
                            items[CAN_ID_INDEX] === id &&
                            inputItems[0] === items[DATA_INDEX];

                        if (!isValidData) return;
                        const dataArr = items.slice(DATA_INDEX);
                        const resDataStr = `${items[CAN_BUS_INDEX]} ${items[CAN_ID_INDEX]}#${dataArr.join(".")}`;
                        if (resDataStr !== sendCommandParam && inputItems[0] === items[DATA_INDEX]) {
                            receiveData = dataArr;
                        }
                    });
                });

                commandExecutor.on("error", (error) => {
                    node.error(`candump error: ${error.message}`);
                });

                commandExecutor.start();
                timer = setTimeout(() => {
                    node.send({ payload: { id, data: receiveData } });
                    cleanTimer();
                    commandExecutor.stop();
                }, 550);
                exec(`cansend ${sendCommandParam}`, (error, _, stderr) => {
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
            cleanTimer();
        });
    }

    RED.nodes.registerType("CAN response", ResponseNode);
};
