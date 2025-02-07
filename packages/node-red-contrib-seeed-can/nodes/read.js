const { DATA_INDEX, DATA_LENGTH, CAN_BUS_INDEX, CAN_ID_INDEX } = require("../utils/constants");

module.exports = function (RED) {
    function ReadNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // 保存配置
        node.rules = config.rules || [];
        const client = RED.nodes.getNode(config.client);
        node.canId = config.canId;
        client.addlistener(node.id, (line) => {
            try {
                const sendArr = [];
                const items = line.split(" ").filter((e) => e !== "");
                const id = items[CAN_ID_INDEX];
                const data = items.slice(DATA_INDEX);
                if (items.length < DATA_INDEX + DATA_LENGTH) {
                    return;
                }
                if (items[CAN_BUS_INDEX] !== client.can.interface) {
                    return;
                }
                if (!config.filter) {
                    node.send({ payload: { id, data } });
                    return;
                }
                if (id !== node.canId) {
                    return;
                }
                if (node.rules.length === 0) {
                    node.send({ payload: { id, data } });
                    return;
                }
                node.rules.forEach((rule, i) => {
                    const item = items[DATA_INDEX + Number(rule.index)];
                    if (item && rule.value === item) {
                        sendArr[i] = { payload: { id, data } };
                    }
                });
                node.send(sendArr);
            } catch (error) {
                node.error(`Error: ${error.message}`);
            }
        });
    }

    RED.nodes.registerType("read", ReadNode, {
        defaults: {
            name: { value: "" },
            canId: { value: "", required: true },
            rules: { value: [] },
        },
    });
};
