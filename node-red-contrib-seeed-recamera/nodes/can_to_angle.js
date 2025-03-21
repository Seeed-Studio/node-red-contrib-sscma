const { YAW_ID, PITCH_ID, hexToAngle } = require("../utils/motor_utils");

module.exports = function (RED) {
    function CanToAngleNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.on("input", function (msg) {
            try {
                // Get input command string
                const command = msg.payload;

                // Validate input
                if (!command || typeof command !== "string") {
                    throw new Error("Input must be a valid command string");
                }

                // Parse command format: motorId#commandType.direction.speed.angleHex
                const parts = command.split("#");
                if (parts.length !== 2) {
                    throw new Error("Invalid command format");
                }

                // Extract motor ID
                const motorId = parts[0];
                if (motorId !== YAW_ID && motorId !== PITCH_ID) {
                    throw new Error(`Unknown motor ID: ${motorId}`);
                }

                // Extract command data
                const commandData = parts[1].split(".");
                if (commandData.length < 8) {
                    throw new Error("Invalid command data format");
                }

                // Extract command type (A6 for absolute, A8 for relative)
                const commandType = commandData[0];

                // Extract angle/offset hex value (last 4 bytes)
                const angleHex = commandData.slice(4).join(".");

                // Convert hex to decimal value
                let angleValue = hexToAngle(angleHex);

                // Convert to degrees if configured
                const outInDegrees = config.outInDegrees || false;
                if (outInDegrees) {
                    angleValue = Number((angleValue / 100).toFixed(2)); // Convert from motor units to degrees
                }

                // Create output object based on command type
                let output;
                if (commandType === "A6") {
                    // Absolute angle command
                    output = {
                        motorId: motorId,
                        angle: angleValue,
                    };

                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: `Absolute: ${angleValue}${outInDegrees ? "°" : ""}`,
                    });
                } else if (commandType === "A8") {
                    // Relative offset command
                    output = {
                        motorId: motorId,
                        offset: angleValue,
                    };

                    // Update status with offset info
                    const sign = angleValue > 0 ? "+" : "";
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: `Offset: ${sign}${angleValue}${outInDegrees ? "°" : ""}`,
                    });
                } else {
                    throw new Error(`Unknown command type: ${commandType}`);
                }

                // Send decoded output
                node.send({ payload: output });
            } catch (error) {
                // Handle errors
                node.error(`Error decoding motor command: ${error.message}`);
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: error.message || "Error",
                });
            }
        });
    }

    RED.nodes.registerType("can-to-angle", CanToAngleNode);
}; 