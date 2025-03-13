const { exec, spawn, ChildProcessWithoutNullStreams } = require("child_process");

// Motor constants
const YAW_ID = "141";
const PITCH_ID = "142";
const DEFAULT_SPEED = "5A.00";
const YAW_MIN_VALUE = 900;
const YAW_MAX_VALUE = 34000;
const PITCH_MIN_VALUE = 900;
const PITCH_MAX_VALUE = 17500;
const CURRENT_YAW_SPEED_KEY = "can$$currentYawSpeed";
const CURRENT_PITCH_SPEED_KEY = "can$$currentPitchSpeed";
const GET_CURRENT_STATUS_COMMAND_24 = "94.00.00.00.00.00.00.00";

// CAN communication constants
const DATA_INDEX = 3;
const DATA_LENGTH = 8;
const CAN_BUS_INDEX = 0;
const CAN_ID_INDEX = 1;
const CAN_BUS = "can0";

// Lock mechanism for CAN bus operations
let canBusLock = false;
let lockQueue = [];

/**
 * Convert speed value to hex string format
 * @param {number} speed - Speed value
 * @returns {string} Hex formatted speed string
 */
function speedToHexString(speed) {
    speed = Math.abs(Math.floor(speed));
    speed = Math.min(speed, 65535);
    const hex = speed.toString(16).toUpperCase().padStart(4, "0");
    const lowByte = hex.slice(2, 4);
    const highByte = hex.slice(0, 2);

    return `${lowByte}.${highByte}`;
}

/**
 * Convert hex speed string to speed value
 * @param {string} hexString - Hex string in "XX.XX" format
 * @returns {number} Converted speed value
 */
function hexToSpeed(hexString) {
    // Handle invalid input
    if (!hexString || typeof hexString !== "string") {
        return 0;
    }

    try {
        // Check if format is "XX.XX"
        const parts = hexString.split(".");
        if (parts.length !== 2 || parts[0].length !== 2 || parts[1].length !== 2) {
            return 0;
        }

        // Low byte first, high byte second, need to reverse order
        const lowByte = parts[0];
        const highByte = parts[1];

        // Combine into correct order hex string and convert to number
        const speed = parseInt(highByte + lowByte, 16);

        return speed;
    } catch (error) {
        console.error(`Error converting hex to speed: ${error.message}`);
        return 0;
    }
}

/**
 * Convert angle to hex string format
 * @param {number} angle - Angle value
 * @returns {string} Hex formatted angle string
 */
function angleToHexString(angle) {
    const int32 = new Int32Array([angle])[0];
    const uint32 = new Uint32Array([int32])[0];
    const hex = uint32.toString(16).toUpperCase().padStart(8, "0");
    const byte1 = hex.slice(6, 8);
    const byte2 = hex.slice(4, 6);
    const byte3 = hex.slice(2, 4);
    const byte4 = hex.slice(0, 2);

    return `${byte1}.${byte2}.${byte3}.${byte4}`;
}

/**
 * Acquire lock for CAN bus operations
 * @returns {Promise<void>} Resolves when lock is acquired
 */
const acquireLock = () => {
    return new Promise((resolve) => {
        if (!canBusLock) {
            canBusLock = true;
            resolve();
        } else {
            // If lock is taken, add resolver to queue
            lockQueue.push(resolve);
        }
    });
};

/**
 * Release lock and process next waiting request if any
 */
const releaseLock = () => {
    if (lockQueue.length > 0) {
        // If queue has waiting requests, wake up the next one
        const nextResolve = lockQueue.shift();
        nextResolve();
    } else {
        // Otherwise release the lock
        canBusLock = false;
    }
};

/**
 * Send motor command and wait for response, using lock mechanism to prevent concurrency issues
 * @param {string} motorId - Motor ID
 * @param {string} commandData - Command data
 * @returns {Promise<Array>} Response data
 */
/**
 * Send a motor command and wait for response
 * @param {string} motorId - Motor ID
 * @param {string} commandData - Command data as string (already formatted)
 * @returns {Promise<Array>} Response data items
 */
function sendMotorCommand(motorId, commandData) {
    // Return a Promise that wraps lock acquisition and release
    return new Promise(async (resolve, reject) => {
        try {
            // Acquire lock
            await acquireLock();

            let timeoutId = null;

            // Execute original command sending logic
            const sendCommand = `${CAN_BUS} ${motorId}#${commandData}`;

            /**
             * @type {ChildProcessWithoutNullStreams}
             */
            let tempProcess = spawn("timeout", [0.5, "candump", CAN_BUS], {});
            
            let responseReceived = false;
            let messageCount = 0;
            let firstMessage = null;
            let secondMessage = null;

            // Set up a function to finish processing, ensuring lock is released in all cases
            const finishProcessing = (error, result) => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                if (tempProcess) {
                    tempProcess.kill();
                    tempProcess = null;
                }
                releaseLock();

                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            };

            tempProcess.stdout.on("data", (data) => {
                try {
                    const outputLines = data.toString().trim().split("\n");
                    
                    // Process each line in the output
                    for (const line of outputLines) {
                        const lineSegments = line.split(" ").filter((segment) => segment !== "");

                        // Validate data format and source
                        if (
                            lineSegments.length < DATA_INDEX + DATA_LENGTH ||
                            lineSegments[CAN_BUS_INDEX] !== CAN_BUS ||
                            lineSegments[CAN_ID_INDEX] !== motorId
                        ) {
                            continue; // Skip non-matching data lines
                        }

                        // Extract response data bytes
                        const responseDataBytes = lineSegments.slice(DATA_INDEX);

                        // Build response string format
                        const responseData = `${lineSegments[CAN_ID_INDEX]}#${responseDataBytes.join(".")}`;
                        const fullResponseString = `${lineSegments[CAN_BUS_INDEX]} ${responseData}`;
                        
                        // Increment message count and store message
                        messageCount++;
                        const isEcho = fullResponseString.toUpperCase() === sendCommand.toUpperCase();

                        if (messageCount === 1) {
                            firstMessage = { data: lineSegments, isEcho: isEcho };
                        } else if (messageCount === 2) {
                            secondMessage = { data: lineSegments, isEcho: isEcho };

                            // Process the two messages
                            // Case 1: First is echo, second is ACK
                            if (firstMessage.isEcho) {
                                responseReceived = true;
                                finishProcessing(null, secondMessage.data);
                                return;
                            }

                            // Case 2: First is ACK, second is echo
                            if (!firstMessage.isEcho && secondMessage.isEcho) {
                                responseReceived = true;
                                finishProcessing(null, firstMessage.data);
                                return;
                            }

                            // If neither case matches, return an error
                            responseReceived = true;
                            finishProcessing(new Error("Unexpected response pattern"), null);
                            return;
                        }

                        // If we've already processed 2 messages, finish processing
                        if (messageCount > 2) {
                            // We should have already finished processing by now, but just in case
                            if (!responseReceived) {
                                responseReceived = true;
                                finishProcessing(new Error("Too many messages received"), null);
                            }
                            return;
                        }
                    }
                } catch (error) {
                    finishProcessing(error);
                }
            });

            tempProcess.stderr.on("data", (data) => {
                finishProcessing(new Error(`candump stderr: ${data}`));
            });

            tempProcess.on("error", (error) => {
                finishProcessing(error);
            });

            tempProcess.on("close", (code) => {
                if (!responseReceived) {
                    finishProcessing(new Error("Incomplete response"), null);
                }
            });

            // Send command
            exec(`cansend ${sendCommand}`, (error, stdout, stderr) => {
                if (error || stderr) {
                    finishProcessing(new Error(`exec error: ${error || stderr}`));
                }
            });

            // Set timeout
            timeoutId = setTimeout(() => {
                if (!responseReceived) {
                    finishProcessing(new Error(`Timeout waiting for response`));
                }
            }, 1000);
        } catch (error) {
            releaseLock();
            reject(error);
        }
    });
}

/**
 * Parse angle value from motor status data
 * @param {Array} statusData - Motor status data
 * @returns {number} Parsed angle value
 */
function parseAngle(statusData) {
    if (!statusData || statusData.length < DATA_INDEX + 6) {
        throw new Error("Invalid status data");
    }

    const angleHex = statusData
        .slice(DATA_INDEX + 4, DATA_INDEX + 6)
        .reverse()
        .join("");
    let angleValue = parseInt(angleHex, 16);

    // Handle abnormal values
    if (angleValue > 35600) {
        angleValue = 0;
    }

    return angleValue;
}

/**
 * Convert hex string in format "byte1.byte2.byte3.byte4" to signed 32-bit integer
 * @param {string} hexString - Hex string in "XX.XX.XX.XX" format
 * @returns {number} Converted signed integer value
 */
function hexToAngle(hexString) {
    try {
        // Split hex string into bytes
        const bytes = hexString.split(".");
        if (bytes.length !== 4) {
            throw new Error("Invalid hex format, expected 4 bytes");
        }

        // Reverse byte order (little endian to big endian)
        const reversedHex = bytes[3] + bytes[2] + bytes[1] + bytes[0];

        // Convert to unsigned 32-bit integer
        const uint32Value = parseInt(reversedHex, 16);

        // Convert to signed 32-bit integer
        // Create a 32-bit buffer and read as Int32
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setUint32(0, uint32Value);
        return view.getInt32(0);
    } catch (error) {
        throw new Error(`Failed to parse angle hex value: ${error.message}`);
    }
}

module.exports = {
    speedToHexString,
    hexToSpeed,
    angleToHexString,
    hexToAngle,
    sendMotorCommand,
    parseAngle,
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
};
