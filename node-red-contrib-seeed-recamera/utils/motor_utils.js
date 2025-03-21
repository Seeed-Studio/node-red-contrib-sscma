// Only import required modules for SocketCAN
let socketcan = null;
try {
    socketcan = require("socketcan");
} catch (error) {
    console.warn("socketcan module not available, SocketCAN method will not work.");
}

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
const GET_CURRENT_STATUS_COMMAND = "94.00.00.00.00.00.00.00";

// CAN bus name
const CAN_BUS = "can0";

// SocketCAN channel management
let canChannel = null;
let currentCommand = null;
let currentMotorId = null;
let currentResolver = null;
let currentRejecter = null;
let commandTimeout = null;

// Command queue management
let commandQueue = [];
let isProcessingQueue = false;

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

/**
 * Convert angle value based on unit setting
 * @param {number} value - Input value
 * @param {string} unit - Unit setting ('0' for decimal, '1' for integer)
 * @returns {number} Converted value in motor units
 */
function convertAngleByUnit(value, unit) {
    if (unit === "1") {
        // Integer input (e.g., 18023 -> 180.23 degrees)
        return value;
    } else {
        // Decimal input (e.g., 180.23 -> 180.23 degrees)
        return value * 100;
    }
}

/**
 * Initialize the SocketCAN channel
 * @returns {Object} SocketCAN channel object
 */
function initCanChannel() {
    if (!canChannel) {
        try {
            if (!socketcan) {
                throw new Error("socketcan module not available");
            }
            canChannel = socketcan.createRawChannel(CAN_BUS, true);

            // Add global message handler
            canChannel.addListener("onMessage", handleSocketCANMessage);
            canChannel.start();
        } catch (error) {
            console.error(`Error initializing SocketCAN channel:`, error);
            throw new Error(`Unable to initialize SocketCAN channel: ${error.message}`);
        }
    }
    return canChannel;
}

/**
 * Close the SocketCAN channel
 */
function closeCanChannel() {
    if (canChannel) {
        try {
            // Clean up current command state
            clearCommandState();

            canChannel.stop();
            canChannel = null;
        } catch (error) {
            console.error(`Error closing SocketCAN channel:`, error);
        }
    }
}

/**
 * Clear current command state
 */
function clearCommandState() {
    if (commandTimeout) {
        clearTimeout(commandTimeout);
        commandTimeout = null;
    }

    currentCommand = null;
    currentMotorId = null;
    currentResolver = null;
    currentRejecter = null;
}

/**
 * Process the next command in the queue
 */
async function processNextCommand() {
    // If already processing or queue is empty, return
    if (isProcessingQueue || commandQueue.length === 0 || currentCommand) {
        return;
    }

    // Set flag to indicate we're processing
    isProcessingQueue = true;

    try {
        // Get the next command from the queue
        const nextCmd = commandQueue.shift();
        const { motorId, commandString, timeout, resolve, reject } = nextCmd;

        // Execute the command
        await executeCommand(motorId, commandString, timeout, resolve, reject);
    } catch (error) {
        console.error("Error processing command queue:", error);
    } finally {
        // Reset processing flag
        isProcessingQueue = false;

        // Check if there are more commands to process
        if (commandQueue.length > 0 && !currentCommand) {
            // Process next command after a short delay to allow state reset
            setTimeout(processNextCommand, 50);
        }
    }
}

/**
 * Execute a specific CAN command
 * @param {number} motorId - Motor ID (decimal)
 * @param {string} commandString - Dot-separated hex command
 * @param {number} timeout - Timeout in milliseconds
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
async function executeCommand(motorId, commandString, timeout, resolve, reject) {
    if (!socketcan) {
        reject(new Error("socketcan module not available"));
        return;
    }

    // If another command is being processed, queue this one
    if (currentCommand) {
        reject(new Error("Internal error: Command state conflict"));
        return;
    }

    try {
        // Ensure CAN channel is initialized
        const channel = initCanChannel();

        // Prepare command data
        const commandBuffer = Buffer.from(commandString.replace(/\./g, ""), "hex");

        // Set current command state
        currentCommand = commandString;
        currentMotorId = motorId;
        currentResolver = resolve;
        currentRejecter = reject;

        // Set timeout timer
        commandTimeout = setTimeout(() => {
            // Clean up state
            const resolver = currentResolver;
            clearCommandState();

            // Return timeout result
            resolver({
                success: false,
                error: "Timeout",
            });

            // Process next command if any
            processNextCommand();
        }, timeout);

        // Send command
        channel.send({
            id: motorId,
            data: commandBuffer,
            ext: false,
            rtr: false,
        });
    } catch (error) {
        // Clean up state
        clearCommandState();
        reject(new Error(`Failed to send command: ${error.message}`));

        // Process next command if any
        processNextCommand();
    }
}

/**
 * SocketCAN message handler
 * @param {Object} msg - SocketCAN message
 */
function handleSocketCANMessage(msg) {
    // If no pending command, return
    if (!currentCommand || !currentResolver || msg.id !== currentMotorId) {
        return;
    }

    // Print received data for debugging
    const dataHex = Buffer.from(msg.data)
        .toString("hex")
        .match(/.{1,2}/g)
        .join(".")
        .toLowerCase();

    // Check if this is a response to the current command
    const cmdHex = currentCommand.replace(/\./g, "").toLowerCase();
    if (dataHex !== cmdHex) {
        // Not command echo
        // Parse angle - only for status query command responses
        let angle = null;
        if (currentCommand.startsWith("94")) {
            try {
                angle = parseAngle(msg.data);
            } catch (error) {
                console.warn(`Failed to parse response data: ${error.message}`);
            }
        }

        // Clear timeout timer
        if (commandTimeout) {
            clearTimeout(commandTimeout);
            commandTimeout = null;
        }

        // Call resolver and clear state
        const resolver = currentResolver;
        clearCommandState();

        resolver({
            success: true,
            data: msg.data,
            angle: angle,
        });

        // Process next command if any
        setTimeout(processNextCommand, 50);
    }
}

/**
 * Parse angle from SocketCAN response data
 * @param {Buffer} statusData - Status data
 * @returns {number} Parsed angle value
 */
function parseAngle(statusData) {
    if (!statusData || statusData.length < 6) {
        throw new Error("Invalid status data");
    }

    // Use bytes 4 and 5
    const lowByte = statusData[4];
    const highByte = statusData[5];

    // Combine to get angle value
    const angleValue = (highByte << 8) | lowByte;

    // Handle abnormal values
    if (angleValue > 35600) {
        return 0;
    }

    return angleValue;
}

/**
 * Send motor command using SocketCAN and wait for response
 * @param {number} motorId - Motor ID (decimal)
 * @param {string} commandString - Dot-separated hex command
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Object>} Response object
 */
async function sendCommand(motorId, commandString, timeout = 1000) {
    return new Promise((resolve, reject) => {
        // Add command to queue
        commandQueue.push({
            motorId,
            commandString,
            timeout,
            resolve,
            reject,
        });

        // Start processing the queue if not already processing
        if (!isProcessingQueue && !currentCommand) {
            processNextCommand();
        }
    });
}

/**
 * Set motor angle using SocketCAN
 * @param {string} motorId - Motor ID (hex)
 * @param {number} targetAngle - Target angle
 * @param {number} currentAngle - Current angle
 * @param {string} speedHex - Speed hex string
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Object>} Result object
 */
async function setMotorAngle(motorId, targetAngle, currentAngle, speedHex = DEFAULT_SPEED, timeout = 1000) {
    try {
        // Determine rotation direction: 01 for CCW, 00 for CW
        const direction = targetAngle < currentAngle ? "01" : "00";

        // Convert target angle to hex
        const angleHex = angleToHexString(targetAngle);

        // Build set angle command
        const command = `A6.${direction}.${speedHex}.${angleHex}`;

        // Send command
        const result = await sendCommand(
            parseInt(motorId, 16), // Convert to decimal
            command,
            timeout,
        );

        if (result.success) {
            return { success: true, angle: targetAngle };
        } else {
            return { success: false, error: result.error };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Set motor offset using SocketCAN with A8 command
 * @param {string} motorId - Motor ID (hex)
 * @param {number} offsetValue - Offset value
 * @param {string} speedHex - Speed hex string
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Object>} Result object
 */
async function setMotorOffset(motorId, offsetValue, speedHex = DEFAULT_SPEED, timeout = 1000) {
    try {
        // Convert offset to hex
        const offsetHex = angleToHexString(offsetValue);

        // Build relative offset command (A8)
        const command = `A8.00.${speedHex}.${offsetHex}`;

        // Send command
        const result = await sendCommand(
            parseInt(motorId, 16), // Convert to decimal
            command,
            timeout,
        );

        if (result.success) {
            return { success: true };
        } else {
            return { success: false, error: result.error };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get current motor angle using SocketCAN
 * @param {string} motorId - Motor ID (hex)
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<number|null>} Current angle or null
 */
async function getMotorAngle(motorId, timeout = 1000) {
    try {
        // Send status query command
        const result = await sendCommand(
            parseInt(motorId, 16), // Convert to decimal
            GET_CURRENT_STATUS_COMMAND,
            timeout,
        );

        if (result.success && result.angle !== null) {
            return result.angle;
        } else {
            return null;
        }
    } catch (error) {
        return null;
    }
}

module.exports = {
    // Constants
    YAW_ID,
    PITCH_ID,
    DEFAULT_SPEED,
    YAW_MIN_VALUE,
    YAW_MAX_VALUE,
    PITCH_MIN_VALUE,
    PITCH_MAX_VALUE,
    CURRENT_YAW_SPEED_KEY,
    CURRENT_PITCH_SPEED_KEY,

    // Conversion utilities
    speedToHexString,
    hexToSpeed,
    angleToHexString,
    hexToAngle,
    convertAngleByUnit,

    // SocketCAN functions
    initCanChannel,
    closeCanChannel,
    sendCommand,
    setMotorAngle,
    setMotorOffset,
    getMotorAngle,
};
