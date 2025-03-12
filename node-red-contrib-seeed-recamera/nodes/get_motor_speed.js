const { hexToSpeed, CURRENT_YAW_SPEED_KEY, CURRENT_PITCH_SPEED_KEY, DEFAULT_SPEED } = require("../utils/motor_utils");

module.exports = function (RED) {
    function GetMotorSpeedNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const globalContext = node.context().global;

        // Motor axis selection: "0" for Yaw axis, "1" for Pitch axis
        const output = config.output;
        const isYawMotor = output === "0";

        // Handle input messages
        node.on("input", function (msg) {
            try {
                // Determine which global variable key to query based on selected axis
                const speedKey = isYawMotor ? CURRENT_YAW_SPEED_KEY : CURRENT_PITCH_SPEED_KEY;

                // Get speed value from global context and convert from hex
                const speedHexValue = globalContext.get(speedKey) || DEFAULT_SPEED;
                const speedValue = hexToSpeed(speedHexValue) || 90;

                // Update node status with current speed
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: `${isYawMotor ? "Yaw" : "Pitch"} Speed: ${speedValue}`,
                });

                // Send speed value to downstream nodes
                node.send({
                    payload: speedValue,
                });
            } catch (error) {
                // Handle errors
                node.error(`Error reading motor speed: ${error.message}`);
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: error.message || "Error",
                });
            }
        });
    }

    RED.nodes.registerType("get-motor-speed", GetMotorSpeedNode);
};
