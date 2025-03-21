const { sendMotorCommand, checkCanPayloadInput, closeCanChannel } = require("../utils/can_utils");

module.exports = function (RED) {
    function CanWriteNode(config) {
        RED.nodes.createNode(this, config);
        const client = RED.nodes.getNode(config.client);
        const node = this;

        // Flag to track if we're waiting for a response
        let waitingForResponse = false;

        // Handle input messages
        node.on("input", function (msg) {
            // If already waiting for a response, send busy message to error output
            if (waitingForResponse) {
                node.status({ fill: "yellow", shape: "ring", text: "Busy" });
                // 发送错误消息到错误输出，这样流可以处理忙碌状态
                node.error("Node is busy processing another command", msg);
                return;
            }

            try {
                // Get CAN interface
                const canInterface = client.can.interface;
                if (!canInterface) {
                    throw new Error("CAN interface not configured");
                }

                let id, items;
                
                // 支持两种输入格式：对象或字符串
                if (typeof msg.payload === 'string') {
                    // 处理字符串格式: "141#c1.0a.64.00.00.00.00.00"
                    const parts = msg.payload.split('#');
                    if (parts.length !== 2) {
                        throw new Error("Invalid string format. Expected: ID#DATA (e.g. 141#c1.0a.64.00.00.00.00.00)");
                    }
                    
                    id = parts[0].trim();
                    items = parts[1].split('.').map(item => item.trim());
                    
                    // 验证数据部分
                    if (items.length !== 8) {
                        throw new Error("Data must contain exactly 8 bytes");
                    }
                } else {
                    // 处理对象格式: { id: "141", data: ["C1", "0A", ...] }
                    const data = msg.payload;
                    // Validate input data format
                    const validated = checkCanPayloadInput(data);
                    id = validated.id;
                    items = validated.items;
                }

                // Set status to "Processing"
                waitingForResponse = true;
                node.status({ fill: "blue", shape: "dot", text: "Processing" });

                // Use sendMotorCommand to send command and wait for response
                sendMotorCommand(canInterface, id, items)
                    .then((responseData) => {
                        // 生成标准格式字符串输出
                        const canMessage = `${id}#${responseData.join('.')}`;
                        
                        // 同时提供详细信息供高级处理
                        const detailsObj = {
                            id: id,
                            data: responseData,
                            raw: responseData.join('.')
                        };

                        // 发送统一格式的响应
                        node.send({
                            payload: canMessage,
                            details: detailsObj
                        });

                        // Update node status
                        node.status({
                            fill: "green",
                            shape: "dot",
                            text: canMessage
                        });
                    })
                    .catch((error) => {
                        // 处理系统繁忙错误
                        const isBusy = error.message.includes('BUSY');
                        const statusText = isBusy ? "System Busy" : (error.message || "Error");
                        
                        // Handle errors
                        node.error(`Error: ${error.message}`, msg);
                        node.status({
                            fill: "red",
                            shape: "ring",
                            text: statusText
                        });
                    })
                    .finally(() => {
                        // Reset waiting state regardless of success or failure
                        waitingForResponse = false;
                    });
            } catch (error) {
                // 处理输入验证或其他错误
                const isBusy = error.message.includes('BUSY');
                const statusText = isBusy ? "System Busy" : (error.message || "Error");
                
                // Handle input validation errors
                node.error(`Error: ${error.message}`, msg);
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: statusText
                });

                waitingForResponse = false;
            }
        });

        // Clean up resources when node is closed
        node.on("close", function() {
            try {
                closeCanChannel();
            } catch (error) {
                // Ignore close errors
            }
        });
    }

    RED.nodes.registerType("can-write", CanWriteNode);
};