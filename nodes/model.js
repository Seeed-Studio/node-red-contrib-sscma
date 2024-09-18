module.exports = function (RED) {
    function ModelNode(config) {
        RED.nodes.createNode(this, config);
        node = this;
        node.client = RED.nodes.getNode(config.client);
        node.uri = config.uri;
        node.tiou = config.tiou;
        node.tscore = config.tscore;
        node.trace = config.trace;
        node.debug = config.debug;
        node.counting = config.counting;
        node.splitter = config.splitter;
        console.log(node.splitter)
        node.config = {
            uri: node.uri,
            tiou: parseFloat(node.tiou),
            tscore: parseFloat(node.tscore),
            trace: node.trace,
            debug: node.debug,
            counting: config.counting,
            splitter: node.splitter.split(',').map(Number)
        }

        console.log(node.config)
        node.receive = function (msg) {
            if (msg.type === "sscma") {
                node.send(msg)
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

    RED.nodes.registerType("model", ModelNode);
}
