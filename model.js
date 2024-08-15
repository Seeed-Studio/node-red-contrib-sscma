module.exports = function (RED) {
    function ModelNode(config) {
        RED.nodes.createNode(this, config);
        node = this;
        console.log("config: " + JSON.stringify(config))
        node.client = RED.nodes.getNode(config.client);
        node.uri = config.uri;
        node.tiou = config.tiou;
        node.tscore = config.tscore;
        node.debug = config.debug;

        node.receive = function (msg) {
            console.log("model recieved: " + JSON.stringify(msg));
            if (msg.type === "sscma") {
                node.send(msg)
            } else {
                const config = {
                    uri: node.uri,
                    camera: msg.payload.id,
                    channel: msg.payload.channel,
                    config: msg.payload.model,
                    tiou: node.tiou,
                    tscore: node.tscore,
                    times: -1,
                    debug: node.debug
                }
                console.log("config: " + JSON.stringify(config));
                node.client.request(node.id, "invoke", config);
            }
        }

        if (node.client) {
            node.client.register(node);
            const create = {
                "type": "model",
                "uri": node.uri,
            }
            node.client.request(node.id, "create", create);
        }

        node.on('close', function (removed, done) {
            if (node.client) {
                node.client.deregister(node, done, removed);
                node.client = null;
            }
            done();
        });
    }

    RED.nodes.registerType("model", ModelNode);
}
