module.exports = function (RED) {
    function ReadNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.on("input", function (msg) {
            if (typeof msg?.payload !== "object") {
                return;
            }
            const { yaw_axis, pitch_axis } = msg.payload;
            console.log(yaw_axis, pitch_axis);
            console.log(config);
            const tempMsg = {
                [config.output]: {
                    yaw_axis: 12.2,
                    pitch_axis: null,
                },
            };
            node.send(tempMsg);
        });
    }

    RED.nodes.registerType("read", ReadNode);
};
