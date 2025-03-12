const { sendMotorCommand, checkCanPayloadInput } = require("../utils/can_utils");

module.exports = function (RED) {
    function CanWriteNode(config) {
        RED.nodes.createNode(this, config);
        const client = RED.nodes.getNode(config.client);
        const node = this;

        // 标记是否正在等待响应
        let waitingForResponse = false;

        // 处理输入消息
        node.on("input", function (msg) {
            // 如果正在等待响应，通知上游节点
            if (waitingForResponse) {
                node.status({ fill: "yellow", shape: "ring", text: "Busy" });
                return;
            }

            try {
                // 获取 CAN 接口
                const canInterface = client.can.interface;
                if (!canInterface) {
                    throw new Error("CAN interface not configured");
                }

                const data = msg.payload;

                // 验证输入数据格式
                const { id, items } = checkCanPayloadInput(data);

                // 设置状态为"处理中"
                waitingForResponse = true;
                node.status({ fill: "blue", shape: "dot", text: "Processing" });

                // 使用 sendMotorCommand 发送命令并等待响应
                sendMotorCommand(canInterface, id, items)
                    .then((responseData) => {
                        // 发送成功响应给下游节点
                        node.send({
                            payload: responseData,
                        });

                        // 更新节点状态
                        node.status({
                            fill: "green",
                            shape: "dot",
                            text: "Success",
                        });
                    })
                    .catch((error) => {
                        // 处理错误
                        node.error(`Error: ${error.message}`);
                        node.status({
                            fill: "red",
                            shape: "ring",
                            text: error.message || "Error",
                        });
                    })
                    .finally(() => {
                        // 无论成功或失败，重置等待状态
                        waitingForResponse = false;
                    });
            } catch (error) {
                // 处理输入验证错误
                node.error(`Error: ${error.message}`);
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: error.message || "Error",
                });

                waitingForResponse = false;
            }
        });
    }

    RED.nodes.registerType("can-write", CanWriteNode);
};
