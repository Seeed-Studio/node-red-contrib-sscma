const { YAW_ID, PITCH_ID, GET_CURRENT_STATUS_COMMAND_24, parseAngle, sendMotorCommand } = require("../utils/motor_utils");

module.exports = function (RED) {
    function GetMotorAngleNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Flag to track if we're currently processing a command
        let waitingForResponse = false;

        /**
         * Read current motor angle using status command
         * @param {string} motorId - Motor ID
         * @returns {Promise<number>} Current angle value in raw units
         */
        async function readCurrentAngle(motorId) {
            try {
                const statusData = await sendMotorCommand(motorId, GET_CURRENT_STATUS_COMMAND_24);
                return parseAngle(statusData); // Return raw angle value
            } catch (error) {
                throw new Error(`Failed to read motor angle: ${error.message}`);
            }
        }

        // Handle input messages
        node.on("input", async function (msg) {
            // If already processing, discard message
            if (waitingForResponse) {
                node.status({ fill: "yellow", shape: "ring", text: "Busy" });
                return;
            }

            try {
                // Set processing flag before async operation
                waitingForResponse = true;
                node.status({ fill: "blue", shape: "dot", text: "Reading" });

                // Determine motor type (yaw or pitch) based on configuration
                const output = config.output;
                const isYawMotor = output === "0";
                const motorId = isYawMotor ? YAW_ID : PITCH_ID;

                // Read current motor position (raw value)
                const rawAngle = await readCurrentAngle(motorId);

                // Convert to degrees if configured to do so
                const outputInDegrees = config.outputInDegrees || false;

                // Format display value (always show in degrees for status)
                const displayAngle = Number((rawAngle / 100).toFixed(2));

                const outputAngle = outputInDegrees ? displayAngle : rawAngle;

                // Update status with current angle
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: `${isYawMotor ? "Yaw" : "Pitch"}: ${outputInDegrees ? displayAngle + "°" : rawAngle + " (raw)"}`,
                });

                // Send the angle to the output
                node.send({ payload: outputAngle });
            } catch (error) {
                node.error(`Error: ${error.message}`);
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: error.message || "Error",
                });
            } finally {
                // Ensure processing flag is reset in all cases
                waitingForResponse = false;
            }
        });

        node.on("close", function () {
            // No resources to clean up
        });
    }

    RED.nodes.registerType("get-motor-angle", GetMotorAngleNode);
};
