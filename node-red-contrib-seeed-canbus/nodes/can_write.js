const { sendMotorCommand, checkCanPayloadInput } = require("../utils/can_utils");

module.exports = function (RED) {
    function CanWriteNode(config) {
        RED.nodes.createNode(this, config);
        const client = RED.nodes.getNode(config.client);
        const node = this;

        // Flag to track if we're waiting for a response
        let waitingForResponse = false;

        // Handle input messages
        node.on("input", function (msg) {
            // If already waiting for a response, notify upstream nodes
            if (waitingForResponse) {
                node.status({ fill: "yellow", shape: "ring", text: "Busy" });
                return;
            }

            try {
                // Get CAN interface
                const canInterface = client.can.interface;
                if (!canInterface) {
                    throw new Error("CAN interface not configured");
                }

                const data = msg.payload;

                // Validate input data format
                const { id, items } = checkCanPayloadInput(data);

                // Set status to "Processing"
                waitingForResponse = true;
                node.status({ fill: "blue", shape: "dot", text: "Processing" });

                // Use sendMotorCommand to send command and wait for response
                sendMotorCommand(canInterface, id, items)
                    .then((responseData) => {
                        // Send successful response to downstream nodes
                        node.send({
                            payload: responseData,
                        });

                        // Update node status
                        node.status({
                            fill: "green",
                            shape: "dot",
                            text: "Success",
                        });
                    })
                    .catch((error) => {
                        // Handle errors
                        node.error(`Error: ${error.message}`);
                        node.status({
                            fill: "red",
                            shape: "ring",
                            text: error.message || "Error",
                        });
                    })
                    .finally(() => {
                        // Reset waiting state regardless of success or failure
                        waitingForResponse = false;
                    });
            } catch (error) {
                // Handle input validation errors
                node.error(`Error: ${error.message}`);
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: error.message || "Error",
                });

                waitingForResponse = false;
            }
        });
    }

    RED.nodes.registerType("can-write", CanWriteNode);
};