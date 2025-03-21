const { exec } = require("child_process");
const util = require("util");

// Add socketcan module import
let socketcan = null;
try {
    socketcan = require("socketcan");
} catch (error) {
    console.warn("socketcan module not available, SocketCAN method will not work.");
}

const execAsync = util.promisify(exec);

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

// Track received messages - 简化状态变量
let receivedMessage = null;

// 外部消息处理器列表
let externalMessageHandlers = [];

/**
 * 添加外部消息处理器
 * @param {Function} handler - 消息处理函数
 * @returns {number} 处理器ID，用于后续移除
 */
function addMessageHandler(handler) {
    if (typeof handler !== 'function') {
        throw new Error('Message handler must be a function');
    }
    externalMessageHandlers.push(handler);
    return externalMessageHandlers.length - 1; // 返回处理器ID
}

/**
 * 移除外部消息处理器
 * @param {number} handlerId - 处理器ID
 */
function removeMessageHandler(handlerId) {
    if (handlerId >= 0 && handlerId < externalMessageHandlers.length) {
        // 将处理器替换为null，而不是从数组中移除，以保持ID稳定
        externalMessageHandlers[handlerId] = null;
    }
}

/**
 * Initialize the SocketCAN channel
 * @param {string} canInterface - CAN bus interface name
 * @returns {Object} SocketCAN channel object
 */
function initCanChannel(canInterface) {
    if (!canChannel) {
        try {
            if (!socketcan) {
                throw new Error("socketcan module not available");
            }
            canChannel = socketcan.createRawChannel(canInterface, true);
            
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
    receivedMessage = null;
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
        const { canInterface, motorId, commandData, timeout, resolve, reject } = nextCmd;

        // Execute the command
        await executeCommand(canInterface, motorId, commandData, timeout, resolve, reject);
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
 * @param {string} canInterface - CAN bus interface name
 * @param {string} motorId - Motor ID (hex)
 * @param {Array<string>} commandData - Command data array
 * @param {number} timeout - Timeout in milliseconds
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
async function executeCommand(canInterface, motorId, commandData, timeout, resolve, reject) {
    if (!socketcan) {
        reject(new Error("socketcan module not available"));
        return;
    }

    try {
        // Convert command data array to dot-separated string
        const commandString = commandData.join('.');
        
        // Convert motor ID from hex string to decimal
        const motorIdDecimal = parseInt(motorId, 16);
        
        // Ensure CAN channel is initialized
        const channel = initCanChannel(canInterface);
        
        // If a command is already being processed, reject with error
        if (currentCommand) {
            reject(new Error("Internal error: Command state conflict"));
            return;
        }
        
        // Prepare command data
        const commandBuffer = Buffer.from(commandString.replace(/\./g, ''), 'hex');
        
        // Set current command state
        clearCommandState(); // Clear any previous state
        currentCommand = commandString;
        currentMotorId = motorIdDecimal;
        currentResolver = resolve;
        currentRejecter = reject;
        
        // Set timeout timer
        commandTimeout = setTimeout(() => {
            console.error(`Command timeout: Motor ${motorId} not responding`);
            
            // 简化超时处理逻辑
            const resolver = currentResolver;
            clearCommandState();
            
            // 返回超时结果
            resolver({
                success: false,
                error: "Timeout"
            });
            
            // Process next command if any
            processNextCommand();
        }, timeout);
        
        // Send command
        channel.send({
            id: motorIdDecimal,
            data: commandBuffer,
            ext: false,
            rtr: false
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
 * Process the response and resolve the promise
 */
function processResponse() {
    // If no message received or no resolver, return
    if (!receivedMessage || !currentResolver) {
        return;
    }
    
    // Clear timeout timer
    if (commandTimeout) {
        clearTimeout(commandTimeout);
        commandTimeout = null;
    }
        
    // 调用resolver并清理状态
    const resolver = currentResolver;
    const responseData = receivedMessage;
    clearCommandState();
    
    // 返回成功的结果
    resolver({
        success: true,
        data: responseData.data,
        rawHex: responseData.dataHex
    });
    
    // Process next command if any
    setTimeout(processNextCommand, 50);
}

/**
 * SocketCAN message handler
 * @param {Object} msg - SocketCAN message
 */
function handleSocketCANMessage(msg) {
    // If no pending command, return
    if (currentCommand && currentResolver && msg.id === currentMotorId) {
        // Convert data to hex string
        const dataHex = Buffer.from(msg.data).toString('hex').match(/.{1,2}/g).join('.');
        
        // 存储接收到的消息 - 简化为只存储单个消息
        receivedMessage = {
            data: msg.data,
            dataHex: dataHex
        };
                
        // 收到消息后立即处理响应
        processResponse();
    }
    
    // 调用所有注册的外部消息处理器
    for (let i = 0; i < externalMessageHandlers.length; i++) {
        const handler = externalMessageHandlers[i];
        if (handler) {
            try {
                handler(msg);
            } catch (error) {
                console.error(`Error in external message handler ${i}: ${error.message}`);
            }
        }
    }
}

/**
 * Send CAN command using SocketCAN and wait for response
 * @param {string} canInterface - CAN bus interface name
 * @param {string} motorId - Motor ID (hex)
 * @param {Array<string>} commandData - Command data array
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Array>} Response data
 */
async function sendMotorCommand(canInterface, motorId, commandData, timeout = 1000) {
    if (!socketcan) {
        throw new Error("socketcan module not available");
    }
    
    return new Promise((resolve, reject) => {
        // Add command to queue
        commandQueue.push({
            canInterface,
            motorId,
            commandData,
            timeout,
            resolve: result => {
                if (result.success) {
                    // Process the data into the format expected by existing code
                    const responseData = [];
                    if (result.data) {
                        // Convert Buffer to Array of hex strings
                        for (let i = 0; i < result.data.length; i++) {
                            responseData.push(result.data[i].toString(16).padStart(2, '0').toUpperCase());
                        }
                    }
                    resolve(responseData);
                } else {
                    reject(new Error(result.error || "Unknown error"));
                }
            },
            reject
        });
        
        // Start processing the queue if not already processing
        if (!isProcessingQueue && !currentCommand) {
            processNextCommand();
        }
    });
}

/**
 * Check if CAN payload input is valid
 * @param {Object|String} data - Input data to check (object or string format)
 * @returns {Object} Validated input data
 */
function checkCanPayloadInput(data) {
    let id, items;

    // 处理字符串格式输入: "141#c1.0a.64.00.00.00.00.00"
    if (typeof data === 'string') {
        const parts = data.split('#');
        if (parts.length !== 2) {
            throw new Error("Invalid string format. Expected: ID#DATA (e.g. 141#c1.0a.64.00.00.00.00.00)");
        }
        
        id = parts[0].trim();
        items = parts[1].split('.').map(item => item.trim());
        
        // 验证ID是否为有效的十六进制字符串
        if (!/^[0-9A-Fa-f]+$/.test(id)) {
            throw new Error(`CAN ID ${id} is not a valid hex value`);
        }
        
        // 验证数据部分
        if (items.length !== 8) {
            throw new Error("Data must contain exactly 8 bytes");
        }
    }
    // 处理对象格式输入: { id: "141", data: ["C1", "0A", ...] }
    else if (data && typeof data === "object") {
        id = data.id;
        items = data.data;

        if (!id || typeof id !== "string") {
            throw new Error("CAN ID must be a string");
        }

        if (!items || !Array.isArray(items)) {
            throw new Error("Data items must be an array");
        }
    }
    else {
        throw new Error("Payload must be an object or a string in format 'ID#DATA'");
    }

    // 验证数组长度
    if (items.length !== 8) {
        throw new Error("Data items must be exactly 8 bytes");
    }

    // 验证每个项是有效的十六进制字节
    for (let i = 0; i < items.length; i++) {
        if (typeof items[i] !== 'string' || !/^[0-9A-Fa-f]{2}$/.test(items[i])) {
            throw new Error(`Data byte at index ${i} (${items[i]}) is not a valid hex byte`);
        }
    }

    return { id, items };
}

/**
 * Get available CAN interfaces
 * @param {string} interfaceName - Base interface name to search for
 * @returns {Promise<Array<string>>} Array of interface names
 */
async function getCanInterfaces(interfaceName = "can") {
    try {
        const { stdout } = await execAsync("ip -d link show");
        const lines = stdout.split("\n");
        const interfaces = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith(interfaceName)) {
                const parts = line.split(":");
                if (parts.length > 1) {
                    interfaces.push(parts[1].trim());
                }
            }
        }

        return interfaces;
    } catch (error) {
        console.error(`Error getting CAN interfaces: ${error.message}`);
        return [];
    }
}

/**
 * Run a shell command
 * @param {string} command - Command to run
 * @returns {Promise<Object>} Command result
 */
async function runCommand(command) {
    try {
        const { stdout, stderr } = await execAsync(command);
        return {
            success: true,
            stdout,
            stderr,
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
}

module.exports = {
    sendMotorCommand,
    checkCanPayloadInput,
    getCanInterfaces,
    runCommand,
    initCanChannel,
    closeCanChannel,
    addMessageHandler,
    removeMessageHandler
};
