const {
    YAW_ID,
    PITCH_ID,
    YAW_MIN_VALUE,
    YAW_MAX_VALUE,
    PITCH_MIN_VALUE,
    PITCH_MAX_VALUE,
    CURRENT_YAW_SPEED_KEY,
    CURRENT_PITCH_SPEED_KEY,
    GET_CURRENT_STATUS_COMMAND_24,
    angleToHexString,
    speedToHexString,
    sendMotorCommand,
    parseAngle,
} = require("../utils/motor_utils");

module.exports = function (RED) {
    function TrackNode(config) {
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
         * Process tracking command with boundary checks
         * @param {Object} params - Tracking parameters
         * @returns {Promise<Object>} Results of tracking commands
         */
        async function processTrackingCommand(params) {
            try {
                const { yaw_offset, yaw_speed, pitch_offset, pitch_speed } = params;

                // Validate parameters
                if (yaw_offset === undefined || pitch_offset === undefined) {
                    throw new Error("Missing offset values");
                }

                // Set speeds if provided
                if (yaw_speed !== undefined && !isNaN(Number(yaw_speed))) {
                    const yawSpeedHex = speedToHexString(Number(yaw_speed));
                    globalContext.set(CURRENT_YAW_SPEED_KEY, yawSpeedHex);
                }

                if (pitch_speed !== undefined && !isNaN(Number(pitch_speed))) {
                    const pitchSpeedHex = speedToHexString(Number(pitch_speed));
                    globalContext.set(CURRENT_PITCH_SPEED_KEY, pitchSpeedHex);
                }

                // Get current speeds from global context
                const yawSpeedHex = globalContext.get(CURRENT_YAW_SPEED_KEY) || speedToHexString(DEFAULT_SPEED);
                const pitchSpeedHex = globalContext.get(CURRENT_PITCH_SPEED_KEY) || speedToHexString(DEFAULT_SPEED);

                // Process commands in sequence
                let results = [];

                // Only process yaw if offset is not zero
                if (yaw_offset !== 0) {
                    // Read current yaw angle
                    const currentYawAngle = await readCurrentAngle(YAW_ID);

                    // Convert degrees to motor units (multiply by 100)
                    let yawOffsetUnits = Math.round(yaw_offset * 100);

                    // Calculate final position and check boundaries
                    let finalYawPosition = currentYawAngle + yawOffsetUnits;

                    // Adjust if out of bounds
                    if (finalYawPosition < YAW_MIN_VALUE) {
                        yawOffsetUnits = YAW_MIN_VALUE - currentYawAngle;
                        finalYawPosition = YAW_MIN_VALUE;
                    } else if (finalYawPosition > YAW_MAX_VALUE) {
                        yawOffsetUnits = YAW_MAX_VALUE - currentYawAngle;
                        finalYawPosition = YAW_MAX_VALUE;
                    }

                    // Skip if no actual offset after boundary check
                    if (yawOffsetUnits !== 0) {
                        const yawOffsetHex = angleToHexString(yawOffsetUnits);

                        // Create relative movement command (A8)
                        const yawCommand = `${YAW_ID}#A8.00.${yawSpeedHex}.${yawOffsetHex}`;

                        // Send command
                        await sendMotorCommand(YAW_ID, `A8.00.${yawSpeedHex}.${yawOffsetHex}`);
                        results.push({
                            motor: "yaw",
                            command: yawCommand,
                            currentPosition: currentYawAngle / 100, // Convert to degrees
                            requestedOffset: yaw_offset,
                            actualOffset: yawOffsetUnits / 100, // Convert to degrees
                            finalPosition: finalYawPosition / 100, // Convert to degrees
                        });
                    }
                }

                // Only process pitch if offset is not zero
                if (pitch_offset !== 0) {
                    // Read current pitch angle
                    const currentPitchAngle = await readCurrentAngle(PITCH_ID);

                    // Convert degrees to motor units (multiply by 100)
                    let pitchOffsetUnits = Math.round(pitch_offset * 100);

                    // Calculate final position and check boundaries
                    let finalPitchPosition = currentPitchAngle + pitchOffsetUnits;

                    // Adjust if out of bounds
                    if (finalPitchPosition < PITCH_MIN_VALUE) {
                        pitchOffsetUnits = PITCH_MIN_VALUE - currentPitchAngle;
                        finalPitchPosition = PITCH_MIN_VALUE;
                    } else if (finalPitchPosition > PITCH_MAX_VALUE) {
                        pitchOffsetUnits = PITCH_MAX_VALUE - currentPitchAngle;
                        finalPitchPosition = PITCH_MAX_VALUE;
                    }

                    // Skip if no actual offset after boundary check
                    if (pitchOffsetUnits !== 0) {
                        const pitchOffsetHex = angleToHexString(pitchOffsetUnits);

                        // Create relative movement command (A8)
                        const pitchCommand = `${PITCH_ID}#A8.00.${pitchSpeedHex}.${pitchOffsetHex}`;

                        // Send command
                        await sendMotorCommand(PITCH_ID, `A8.00.${pitchSpeedHex}.${pitchOffsetHex}`);
                        results.push({
                            motor: "pitch",
                            command: pitchCommand,
                            currentPosition: currentPitchAngle / 100, // Convert to degrees
                            requestedOffset: pitch_offset,
                            actualOffset: pitchOffsetUnits / 100, // Convert to degrees
                            finalPosition: finalPitchPosition / 100, // Convert to degrees
                        });
                    }
                }

                return results;
            } catch (error) {
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

                // Get tracking parameters from payload
                const trackingParams = msg.payload;

                if (!trackingParams || typeof trackingParams !== "object") {
                    throw new Error("Invalid tracking parameters");
                }

                // Set processing status
                node.status({ fill: "blue", shape: "dot", text: "Processing" });

                // Process tracking command
                const results = await processTrackingCommand(trackingParams);

                // Update status with tracking info
                let statusText = "";

                results.forEach((result) => {
                    if (result.motor === "yaw") {
                        statusText += `Yaw: ${result.actualOffset.toFixed(2)}° `;
                    } else if (result.motor === "pitch") {
                        statusText += `Pitch: ${result.actualOffset.toFixed(2)}° `;
                    }
                });

                if (!statusText) {
                    statusText = "No movement";
                }

                node.status({
                    fill: "green",
                    shape: "dot",
                    text: statusText,
                });

                // Send results to output
                msg.payload = results;
                node.send(msg);
            } catch (error) {
                // Handle errors
                node.error(`Error tracking: ${error.message}`);
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
    }

    RED.nodes.registerType("track", TrackNode);
};
