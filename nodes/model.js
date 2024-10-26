module.exports = function (RED) {
    function ModelNode(config) {
        RED.nodes.createNode(this, config);
        node = this;
        node.client = RED.nodes.getNode(config.client);
        node.config = {
            uri: config.uri,
            tiou: parseFloat(config.tiou),
            tscore: parseFloat(config.tscore),
            trace: config.trace,
            debug: config.debug,
            counting: config.counting,
            splitter: config.splitter.split(',').map((c) => parseInt(c.trim())),
            labels: config.classes.split(',').map((c) => c.trim()),
        }

        // if connect to preview, set preview to true
        node.wires.forEach(wires => {
            wires.forEach(wire => {
                RED.nodes.eachNode(function (n) {
                    if (n.id === wire && n.type === "preview" && !n.d) {
                        node.config.debug = true
                    }
                });
            });
        });


        node.message = function (msg) {
            //console.log(msg.payload.name);
            node.send(msg);
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
