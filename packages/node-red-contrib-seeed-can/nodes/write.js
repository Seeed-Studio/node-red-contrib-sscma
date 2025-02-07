const { exec } = require("child_process");
const { checkCanPayloadInput } = require("../utils/check");

module.exports = function (RED) {
    function WriteNode(config) {
        RED.nodes.createNode(this, config);
        const client = RED.nodes.getNode(config.client);
        const node = this;
        node.on("input", function (msg) {
            try {
                const data = msg.payload;
                checkCanPayloadInput(data, node);
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
    }

    RED.nodes.registerType("write", WriteNode);
};
