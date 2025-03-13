const { exec, spawn, ChildProcessWithoutNullStreams } = require("child_process");
const util = require("util");

const execAsync = util.promisify(exec);

// CAN communication constants
const DATA_INDEX = 3;
const DATA_LENGTH = 8;
const CAN_BUS_INDEX = 0;
const CAN_ID_INDEX = 1;

let canBusLock = false;
let lockQueue = [];

/**
 * Acquire lock for CAN bus operations
 * @returns {Promise<void>} Resolves when lock is acquired
 */
function acquireLock() {
    return new Promise((resolve) => {
        if (!canBusLock) {
            canBusLock = true;
            resolve();
        } else {
            // If lock is taken, add resolver to queue
            lockQueue.push(resolve);
        }
    });
}

/**
 * Release lock and process next waiting request if any
 */
function releaseLock() {
    if (lockQueue.length > 0) {
        // If queue has waiting requests, wake up the next one
        const nextResolve = lockQueue.shift();
        nextResolve();
    } else {
        // Otherwise release the lock
        canBusLock = false;
    }
}

/**
 * Send a CAN command and wait for response with lock mechanism
 * @param {string} canBus - CAN bus interface
 * @param {string} motorId - Motor ID
 * @param {Array<string>} commandData - Command data as array of hex byte strings
 * @returns {Promise<string>} Response data
 */
/**
 * Send a CAN command and wait for response with lock mechanism
 * @param {string} canBus - CAN bus interface
 * @param {string} motorId - Motor ID
 * @param {Array<string>} commandData - Command data as array of hex byte strings
 * @returns {Promise<string>} Response data
 */
function sendMotorCommand(canBus, motorId, commandData) {
    const timeout = 1000;

    return new Promise(async (resolve, reject) => {
        try {
            // Acquire lock before proceeding
            await acquireLock();

            let timeoutId = null;

            const commandDataString = commandData.join(".");
            const sendCommand = `${canBus} ${motorId}#${commandDataString}`;
            /**
             * @type {ChildProcessWithoutNullStreams}
             */
            let tempProcess = spawn("timeout", [0.5, "candump", canBus], {});

            let responseReceived = false;
            let messageCount = 0;
            let firstMessage = null;
            let secondMessage = null;

            // Create a function to handle completion in all cases
            const finishProcessing = (error, result) => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                if (tempProcess) {
                    tempProcess.kill();
                    tempProcess = null;
                }
                releaseLock(); // Release lock when done

                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            };

            tempProcess.stdout.on("data", (rawData) => {
                try {
                    const outputLines = rawData.toString().trim().split("\n");

                    // Process each line in the output
                    for (const line of outputLines) {
                        const lineSegments = line.split(" ").filter((segment) => segment !== "");

                        // Validate data format and source
                        if (
                            lineSegments.length < DATA_INDEX + DATA_LENGTH ||
                            lineSegments[CAN_BUS_INDEX] !== canBus ||
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
                            firstMessage = { data: responseData, isEcho: isEcho };
                        } else if (messageCount === 2) {
                            secondMessage = { data: responseData, isEcho: isEcho };

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
            }, timeout);
        } catch (error) {
            // Make sure to release lock in case of unexpected errors
            releaseLock();
            reject(error);
        }
    });
}

/**
 * Validate CAN data format
 * @param {string} data - CAN data string
 * @returns {object} Parsed ID and data items
 */
function checkCanPayloadInput(data) {
    if (typeof data !== "string") {
        throw new Error("Payload must be a string");
    }

    const [id, dataToSend] = data.split("#");
    if (!id || !dataToSend) {
        throw new Error("Payload must be in the format 'id#data'");
    }

    const items = dataToSend.split(".");
    if (items.length !== 8 || items.some((item) => item.length !== 2)) {
        throw new Error("Data must be 8 bytes in hexadecimal format");
    }

    return { id, items };
}

function getCanInterfaces(interfaceName = "can") {
    return new Promise((resolve, reject) => {
        exec("ifconfig -a", (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            const interfaces = [];
            const lines = stdout.split("\n");
            let currentInterface = null;

            for (const line of lines) {
                // macOS 格式: "en0: flags=8863<UP,BROADCAST,..."
                // Linux 格式: "can0      Link encap:UNSPEC  HWaddr..."
                const interfaceMatch = line.match(/^(\S+)[\s:]/) || line.match(/^(\S+)\s+Link/);

                if (interfaceMatch) {
                    currentInterface = interfaceMatch[1].trim();
                    // 如果是以 ${interfaceName} 开头的接口，添加到结果中
                    if (currentInterface.toLowerCase().startsWith(interfaceName)) {
                        if (currentInterface[currentInterface.length - 1] === ":") {
                            currentInterface = currentInterface.slice(0, -1);
                        }
                        interfaces.push(currentInterface);
                    }
                }
            }

            resolve(interfaces);
        });
    });
}

async function runCommand(command) {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
        throw new Error(stderr);
    }
    return stdout;
}

module.exports = {
    sendMotorCommand,
    checkCanPayloadInput,
    getCanInterfaces,
    runCommand,
    DATA_INDEX,
    DATA_LENGTH,
    CAN_BUS_INDEX,
    CAN_ID_INDEX,
};
