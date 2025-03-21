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
    speedToHexString,
    convertAngleByUnit,
    getMotorAngle,
    setMotorAngle,
    setMotorOffset,
    closeCanChannel,
} = require("../utils/motor_utils");

module.exports = function (RED) {
    function SetMotorAngleNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const globalContext = node.context().global;

        // Flag to track if we're currently processing a command
        let waitingForAck = false;

        /**
         * Process single motor movement
         * @param {string} motorId - Motor ID (YAW_ID or PITCH_ID)
         * @param {number} angleValue - Angle value in motor units
         * @param {boolean} isAbsolute - Whether this is absolute positioning
         * @param {string} speedHex - Motor speed in hex format
         * @returns {Promise<Object>} Result with success flag and position
         */
        async function processSingleMotor(motorId, angleValue, isAbsolute, speedHex) {
            // Read current motor position
            const currentAngle = await getMotorAngle(motorId);
            if (currentAngle === null) {
                throw new Error(`Failed to read current ${motorId === YAW_ID ? "yaw" : "pitch"} angle`);
            }

            let finalPosition; // Store final position (absolute angle)

            if (isAbsolute) {
                // Absolute angle mode - A6 command
                let targetAngle = angleValue;

                // Apply angle limits based on motor type
                if (motorId === YAW_ID) {
                    targetAngle = Math.max(YAW_MIN_VALUE, Math.min(YAW_MAX_VALUE, targetAngle));
                } else {
                    targetAngle = Math.max(PITCH_MIN_VALUE, Math.min(PITCH_MAX_VALUE, targetAngle));
                }

                finalPosition = targetAngle;

                // Skip if target equals current position
                if (Math.abs(targetAngle - currentAngle) < 50) {
                    return { success: true, position: finalPosition / 100 }; // Convert to degrees for output
                }

                // Set motor angle with A6 command
                const result = await setMotorAngle(motorId, targetAngle, currentAngle, speedHex);

                if (!result.success) {
                    throw new Error(`Failed to set ${motorId === YAW_ID ? "yaw" : "pitch"} angle: ${result.error}`);
                }
            } else {
                // Relative offset mode - A8 command
                // Calculate final position for limit checking
                finalPosition = currentAngle + angleValue;

                // Adjust offset to respect motor limits
                if (motorId === YAW_ID) {
                    if (finalPosition < YAW_MIN_VALUE) {
                        angleValue = YAW_MIN_VALUE - currentAngle;
                        finalPosition = YAW_MIN_VALUE;
                    } else if (finalPosition > YAW_MAX_VALUE) {
                        angleValue = YAW_MAX_VALUE - currentAngle;
                        finalPosition = YAW_MAX_VALUE;
                    }
                } else {
                    if (finalPosition < PITCH_MIN_VALUE) {
                        angleValue = PITCH_MIN_VALUE - currentAngle;
                        finalPosition = PITCH_MIN_VALUE;
                    } else if (finalPosition > PITCH_MAX_VALUE) {
                        angleValue = PITCH_MAX_VALUE - currentAngle;
                        finalPosition = PITCH_MAX_VALUE;
                    }
                }

                // Skip if no actual offset
                if (Math.abs(angleValue) < 50) {
                    return { success: true, position: finalPosition / 100 }; // Convert to degrees for output
                }

                // Set motor offset using A8 command
                const result = await setMotorOffset(motorId, angleValue, speedHex);

                if (!result.success) {
                    throw new Error(`Failed to set ${motorId === YAW_ID ? "yaw" : "pitch"} offset: ${result.error}`);
                }
            }

            // Return position in degrees
            return { success: true, position: finalPosition / 100 };
        }

        /**
         * Process motor movement request using SocketCAN library
         * @param {Object} msg - Input message
         * @returns {Promise<Object>} Result with success flag and position
         */
        async function processCommand(msg) {
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

                const output = config.output;
                const unit = config.unit || "0";

                // Check if this is dual axis mode
                const isDualAxis = output === "4" || output === "5";
                const isAbsolute = output === "0" || output === "2" || output === "4";

                // Process based on selected mode
                if (isDualAxis) {
                    // Dual axis mode - expect JSON object input
                    if (typeof inputValue !== "object") {
                        throw new Error("Dual axis mode requires JSON object input");
                    }

                    // Validate required fields
                    if (inputValue.yaw_angle === undefined || inputValue.pitch_angle === undefined) {
                        throw new Error("Missing required fields: yaw_angle and/or pitch_angle");
                    }

                    // Set speeds if provided
                    if (inputValue.yaw_speed !== undefined && !isNaN(Number(inputValue.yaw_speed))) {
                        const yawSpeedHex = speedToHexString(Number(inputValue.yaw_speed));
                        globalContext.set(CURRENT_YAW_SPEED_KEY, yawSpeedHex);
                    }

                    if (inputValue.pitch_speed !== undefined && !isNaN(Number(inputValue.pitch_speed))) {
                        const pitchSpeedHex = speedToHexString(Number(inputValue.pitch_speed));
                        globalContext.set(CURRENT_PITCH_SPEED_KEY, pitchSpeedHex);
                    }

                    // Get current speeds from global context
                    const yawSpeedHex = globalContext.get(CURRENT_YAW_SPEED_KEY) || DEFAULT_SPEED;
                    const pitchSpeedHex = globalContext.get(CURRENT_PITCH_SPEED_KEY) || DEFAULT_SPEED;

                    // Convert angle values based on unit setting
                    const yawAngle = convertAngleByUnit(Number(inputValue.yaw_angle), unit);
                    const pitchAngle = convertAngleByUnit(Number(inputValue.pitch_angle), unit);

                    // Process yaw and pitch motors
                    const yawResult = await processSingleMotor(YAW_ID, yawAngle, isAbsolute, yawSpeedHex);
                    const pitchResult = await processSingleMotor(PITCH_ID, pitchAngle, isAbsolute, pitchSpeedHex);

                    // Combine results
                    const result = {
                        success: yawResult.success && pitchResult.success,
                        position: {
                            yaw: yawResult.position,
                            pitch: pitchResult.position,
                        },
                    };

                    // Reset status
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: `Yaw: ${yawResult.position.toFixed(2)}°, Pitch: ${pitchResult.position.toFixed(2)}°`,
                    });

                    return result;
                } else {
                    // Single axis mode
                    // Process single value input
                    const numInputValue = Number(inputValue);
                    if (isNaN(numInputValue)) {
                        throw new Error("Input value is not a number");
                    }

                    // Determine motor type (yaw or pitch)
                    const isYawMotor = output === "0" || output === "1";
                    const motorId = isYawMotor ? YAW_ID : PITCH_ID;

                    // Convert input value to motor angle units
                    const angleValue = convertAngleByUnit(numInputValue, unit);

                    // For relative mode with zero offset, return immediately
                    if (!isAbsolute && angleValue === 0) {
                        node.status({ fill: "green", shape: "dot", text: "Ready" });
                        return { success: true };
                    }

                    // Get motor speed from global context or use default
                    const speedHex = globalContext.get(isYawMotor ? CURRENT_YAW_SPEED_KEY : CURRENT_PITCH_SPEED_KEY) ?? DEFAULT_SPEED;

                    // Process the motor command
                    const result = await processSingleMotor(motorId, angleValue, isAbsolute, speedHex);

                    // Update status
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: `${isYawMotor ? "Yaw" : "Pitch"}: ${result.position.toFixed(2)}°`,
                    });

                    return result;
                }
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

                // Process command using SocketCAN
                const result = await processCommand(msg);

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
            // Clean up resources when node is closed
            try {
                closeCanChannel();
            } catch (error) {
                // Ignore close errors
            }
        });
    }

    RED.nodes.registerType("set-motor-angle", SetMotorAngleNode);
};
