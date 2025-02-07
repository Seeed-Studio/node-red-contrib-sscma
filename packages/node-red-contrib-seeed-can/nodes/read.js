module.exports = function (RED) {
    const DATA_INDEX = 3;
    const DATA_LENGTH = 8;
    const CAN_BUS_INDEX = 0;
    const CAN_ID_INDEX = 1;
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
                if (items.length < DATA_INDEX + DATA_LENGTH) {
                    return;
                }
                if (items[CAN_BUS_INDEX] !== client.can.interface) {
                    return;
                }
                if (!config.filter || node.rules.length === 0) {
                    node.send({ payload: items.slice(DATA_INDEX) });
                    return;
                }
                if (items[CAN_ID_INDEX] !== node.canId) {
                    return;
                }
                if (node.rules.length === 0) {
                    node.send({ payload: items.slice(DATA_INDEX) });
                    return;
                }
                node.rules.forEach((rule, i) => {
                    const item = items[DATA_INDEX + Number(rule.index)];
                    if (item && rule.value === item) {
                        sendArr[i] = { payload: items.slice(DATA_INDEX) };
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
