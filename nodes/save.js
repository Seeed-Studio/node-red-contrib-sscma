module.exports = function (RED) {
    function SaveNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.client = RED.nodes.getNode(config.client);
        node.config = {
            storage: config.storage,
            slice: +config.slice,
            duration: +config.duration * 60,
            enabled: config.start
        }

        node.message = function (msg) {
            if (msg.hasOwnProperty('enabled')) {
                if (msg.enabled) {
                    node.client.request(node.id, "enable", "");
                } else {
                    node.client.request(node.id, "disable", "");
                }
            }
            if (msg.type === "sscma") {
                if (msg.payload.name === "start") {
                    node.status({ fill: "blue", shape: "dot", text: "running" });
                }
                if (msg.payload.name === "stop") {
                    node.status({ fill: "gray", shape: "dot", text: "idle" });
                }
            }
        }

        if (node.client) {
            node.client.register(node);
        }

        node.on('close', function (removed, done) {
            if (node.client) {
                node.client.deregister(node, done, removed);
                node.client = null;
            }
            done();
        });
    }

    RED.nodes.registerType("save", SaveNode);
}
