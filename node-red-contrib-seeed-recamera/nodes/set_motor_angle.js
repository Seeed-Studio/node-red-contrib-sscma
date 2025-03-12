const {
    YAW_ID,
    PITCH_ID,
    DEFAULT_SPEED,
    YAW_MIN_VALUE,
    YAW_MAX_VALUE,
    PITCH_MIN_VALUE,
    PITCH_MAX_VALUE,
    CURRENT_YAW_SPEED_KEY,
    CURRENT_PITCH_SPEED_KEY,
    GET_CURRENT_STATUS_COMMAND_24,
    angleToHexString,
    sendMotorCommand,
    parseAngle,
} = require("../utils/motor_utils");

module.exports = function (RED) {
    function SetMotorAngleNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const globalContext = node.context().global;

        // Flag to track if we're currently processing a command
        let waitingForAck = false;

        /**
         * Read current motor angle using status command
         * @param {string} motorId - Motor ID
         * @returns {Promise<number>} Current angle value
         */
        async function readCurrentAngle(motorId) {
            try {
                const statusData = await sendMotorCommand(motorId, GET_CURRENT_STATUS_COMMAND_24);
                return parseAngle(statusData);
            } catch (error) {
                throw new Error(`Failed to read motor angle: ${error.message}`);
            }
        }

        /**
         * Process motor movement request
         * @param {Object} msg - Input message
         * @returns {Promise<Object>} Result with success flag and position
         */
        async function processMotorMove(msg) {
            try {
                // Set processing status
                node.status({ fill: "blue", shape: "dot", text: "Processing" });

                // Get input value from configured source
                const inputSources = {
                    msg: () => RED.util.getMessageProperty(msg, config.input),
                    flow: () => node.context().flow.get(config.input),
                    global: () => node.context().global.get(config.input),
                };
                const inputValue = inputSources[config["input-type"]]?.();
                if (inputValue === undefined || inputValue === null) {
                    throw new Error("Input value is empty");
                }
                const numInputValue = Number(inputValue);
                if (isNaN(numInputValue)) {
                    throw new Error("Input value is not a number");
                }

                const output = config.output;

                // Determine motor type (yaw or pitch)
                const isYawMotor = output == "0" || output == "1";
                const motorId = isYawMotor ? YAW_ID : PITCH_ID;

                // Determine control mode (absolute or relative)
                const isAbsolute = output == "0" || output == "2";
                const isRelative = !isAbsolute;

                // Convert input value to motor angle units if needed
                let angelValue = numInputValue;
                const inputInDegrees = config.inputInDegrees || false;
                if (inputInDegrees) {
                    // If input is in degrees, convert to motor units
                    angelValue = angelValue * 100;
                }

                // For relative mode with zero offset, return immediately
                if (isRelative && angelValue === 0) {
                    node.status({ fill: "green", shape: "dot", text: "Ready" });
                    return { success: true };
                }

                // Get motor speed from global context or use default
                const speedHex = globalContext.get(isYawMotor ? CURRENT_YAW_SPEED_KEY : CURRENT_PITCH_SPEED_KEY) ?? DEFAULT_SPEED;

                // Read current motor position
                const currentAngelValue = await readCurrentAngle(motorId);
                let commandData;
                let finalPosition; // Store final position (absolute angle)

                if (isAbsolute) {
                    // Absolute angle mode (A6 command)
                    let targetAngle = angelValue;

                    // Apply angle limits based on motor type
                    if (motorId == YAW_ID) {
                        targetAngle = Math.max(YAW_MIN_VALUE, Math.min(YAW_MAX_VALUE, targetAngle));
                    } else {
                        targetAngle = Math.max(PITCH_MIN_VALUE, Math.min(PITCH_MAX_VALUE, targetAngle));
                    }

                    finalPosition = targetAngle;

                    // Skip if target equals current position
                    if (targetAngle == currentAngelValue) {
                        node.status({ fill: "green", shape: "dot", text: "Ready" });
                        return { success: true, position: finalPosition };
                    }

                    // Determine rotation direction (01 for CCW, 00 for CW)
                    const direction = targetAngle < currentAngelValue ? "01" : "00";

                    // Generate absolute position command (A6)
                    const angleHex = angleToHexString(targetAngle);
                    commandData = `A6.${direction}.${speedHex}.${angleHex}`;
                } else {
                    // Relative offset mode (A8 command)
                    // Calculate final position for limit checking
                    finalPosition = currentAngelValue + angelValue;

                    // Adjust offset to respect motor limits
                    if (motorId == YAW_ID) {
                        if (finalPosition < YAW_MIN_VALUE) {
                            angelValue = YAW_MIN_VALUE - currentAngelValue;
                            finalPosition = YAW_MIN_VALUE;
                        } else if (finalPosition > YAW_MAX_VALUE) {
                            angelValue = YAW_MAX_VALUE - currentAngelValue;
                            finalPosition = YAW_MAX_VALUE;
                        }
                    } else {
                        if (finalPosition < PITCH_MIN_VALUE) {
                            angelValue = PITCH_MIN_VALUE - currentAngelValue;
                            finalPosition = PITCH_MIN_VALUE;
                        } else if (finalPosition > PITCH_MAX_VALUE) {
                            angelValue = PITCH_MAX_VALUE - currentAngelValue;
                            finalPosition = PITCH_MAX_VALUE;
                        }
                    }

                    // Skip if no actual offset
                    if (angelValue == 0) {
                        node.status({ fill: "green", shape: "dot", text: "Ready" });
                        return { success: true, position: finalPosition };
                    }

                    // Generate relative offset command (A8)
                    const offsetHex = angleToHexString(angelValue);
                    commandData = `A8.00.${speedHex}.${offsetHex}`;
                }

                // Send motor control command and wait for ACK
                await sendMotorCommand(motorId, commandData);

                // Convert output position to degrees if needed
                let outputPosition = finalPosition;
                const outputInDegrees = config.outputInDegrees || false;
                if (outputInDegrees) {
                    // If output should be in degrees, convert from motor units
                    outputPosition = Number((finalPosition / 100).toFixed(2));
                }

                // Reset status
                node.status({ fill: "green", shape: "dot", text: "Ready" });

                return { success: true, position: outputPosition };
            } catch (error) {
                node.status({ fill: "red", shape: "ring", text: error.message || "Error" });
                throw error;
            }
        }

        // Handle input messages
        node.on("input", async function (msg) {
            // If already processing, discard message
            if (waitingForAck) {
                node.status({ fill: "yellow", shape: "ring", text: "Busy" });
                return;
            }

            try {
                // Set processing flag before async operation
                waitingForAck = true;

                // Process motor movement request
                const result = await processMotorMove(msg);

                // If processing succeeded and position is available, send it
                if (result.success && result.position !== undefined) {
                    msg.payload = result.position;
                    node.send(msg);
                }
            } catch (error) {
                node.error(`Error: ${error.message}`);
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: error.message || "Error",
                });
            } finally {
                // Ensure processing flag is reset in all cases
                waitingForAck = false;
            }
        });

        node.on("close", function () {
            // No resources to clean up
        });
    }

    RED.nodes.registerType("set-motor-angle", SetMotorAngleNode);
};
