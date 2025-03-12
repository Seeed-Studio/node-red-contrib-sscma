const { speedToHexString, CURRENT_YAW_SPEED_KEY, CURRENT_PITCH_SPEED_KEY } = require("../utils/motor_utils");

module.exports = function (RED) {
    function SetMotorSpeedNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const globalContext = node.context().global;

        // Handle input messages
        node.on("input", async function (msg) {
            try {
                // Get input value from configured source (msg, flow, or global)
                const inputSources = {
                    msg: () => RED.util.getMessageProperty(msg, config.input),
                    flow: () => node.context().flow.get(config.input),
                    global: () => node.context().global.get(config.input),
                };
                const inputValue = inputSources[config["input-type"]]?.();

                // Validate input value
                if (inputValue === undefined || inputValue === null) {
                    throw new Error("Input value is empty");
                }

                // Convert input to number and validate
                const numInputValue = Number(inputValue);
                if (isNaN(numInputValue)) {
                    throw new Error("Input value is not a number");
                }

                // Get motor axis selection: "0" for Yaw axis, "1" for Pitch axis
                const output = config.output;
                const isYawMotor = output === "0";

                // Convert speed value to hex format
                const speedHex = speedToHexString(numInputValue);

                // Store speed value in global context for the selected motor
                if (isYawMotor) {
                    globalContext.set(CURRENT_YAW_SPEED_KEY, speedHex);
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: `Yaw Speed: ${numInputValue}`,
                    });
                } else {
                    globalContext.set(CURRENT_PITCH_SPEED_KEY, speedHex);
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: `Pitch Speed: ${numInputValue}`,
                    });
                }

                // This node doesn't have outputs, it only updates global context
            } catch (error) {
                // Handle errors
                node.error(`Error setting motor speed: ${error.message}`);
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: error.message || "Error",
                });
            }
        });
    }

    RED.nodes.registerType("set-motor-speed", SetMotorSpeedNode);
};
