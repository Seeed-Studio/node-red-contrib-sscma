const { initCanChannel, addMessageHandler, removeMessageHandler } = require('../utils/can_utils');

module.exports = function(RED) {
    function CanReadNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const client = RED.nodes.getNode(config.client);
        
        // 节点内部变量
        let canChannel = null;
        let isListening = false;
        let handlerId = -1;
        
        /**
         * 处理接收到的CAN消息
         * @param {Object} msg - SocketCAN消息
         */
        function handleCanMessage(msg) {
            try {
                // 转换数据为十六进制字符串
                const dataHex = Buffer.from(msg.data).toString('hex').match(/.{1,2}/g);
                
                // 格式化消息ID为十六进制字符串
                const idHex = msg.id.toString(16).toUpperCase();
                
                // 生成标准格式 ID#DATA
                const canMessage = `${idHex}#${dataHex.join('.')}`;
                
                // 创建输出消息
                const output = {
                    payload: canMessage,
                    details: {
                        id: idHex,
                        data: dataHex,
                        raw: dataHex.join('.')
                    },
                };
                
                // 发送消息到Node-RED流
                node.send(output);
                
                // 更新节点状态 - 显示最近收到的消息
                node.status({ 
                    fill: "green", 
                    shape: "dot", 
                    text: canMessage
                });
            } catch (error) {
                node.error(`Error processing CAN message: ${error.message}`);
            }
        }
        
        /**
         * 启动CAN监听器
         */
        function startListener() {
            if (isListening) return;
            
            try {
                // 获取CAN接口
                const canInterface = client.can.interface;
                if (!canInterface) {
                    throw new Error("CAN interface not configured");
                }
                
                // 获取共享的CAN通道
                canChannel = initCanChannel(canInterface);
                
                // 注册我们的消息处理器
                handlerId = addMessageHandler(handleCanMessage);
                
                isListening = true;
                node.log(`Started listening on CAN interface ${canInterface} (using shared channel, handler ID: ${handlerId})`);
                node.status({ fill: "green", shape: "ring", text: "Listening" });
            } catch (error) {
                node.error(`Failed to start CAN listener: ${error.message}`);
                node.status({ fill: "red", shape: "ring", text: "Failed to start" });
            }
        }
        
        /**
         * 停止CAN监听器
         */
        function stopListener() {
            if (!isListening || handlerId < 0) return;
            
            try {
                // 移除我们的消息处理器
                removeMessageHandler(handlerId);
                handlerId = -1;
                canChannel = null;
                isListening = false;
                
                node.log("Stopped CAN listener (shared channel remains active)");
                node.status({ fill: "grey", shape: "ring", text: "Stopped" });
            } catch (error) {
                node.error(`Error stopping CAN listener: ${error.message}`);
            }
        }
        
        // 节点部署时自动启动监听器
        startListener();
        
        // 清理：节点被移除时停止监听器
        node.on('close', function() {
            stopListener();
        });
    }
    
    RED.nodes.registerType("can-read", CanReadNode);
}; 