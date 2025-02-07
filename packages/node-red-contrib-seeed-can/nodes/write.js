const { exec } = require("child_process");

module.exports = function (RED) {
    function writeNode(config) {
        RED.nodes.createNode(this, config);
        const client = RED.nodes.getNode(config.client);
        const node = this;
        node.on("input", function (msg) {
            const data = msg.payload;
            if (typeof data !== "string") {
                node.error("Payload must be a string");
                this.status({ fill: "red", shape: "ring", text: "Input is not string" });
                return;
            }
            const [id, dataToSend] = data.split("#");
            if (!id || !dataToSend) {
                node.error("Payload must be in the format 'id#data'");
                this.status({ fill: "red", shape: "ring", text: "Input format error" });
                return;
            }
            const items = dataToSend.split(".");
            if (items.length !== 8 || items.every((item) => item.length !== 2)) {
                node.error("Data must be 8 bytes in hexadecimal format");
                this.status({ fill: "red", shape: "ring", text: "Input format error" });
                return;
            }
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
        });
    }

    RED.nodes.registerType("write", writeNode);
};
