module.exports = function (RED) {
    function StreamNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        console.log("config: " + JSON.stringify(config))
        node.client = RED.nodes.getNode(config.client);

        node.receive  = function(msg) {
            console.log("camera recieved: " + JSON.stringify(msg));
            node.send(msg);
        }

        if (node.client) {
            node.client.register(node);
        }
        
        node.on('close', function(removed, done) {
            if (node.client) {
                node.client.deregister(node, done, removed);
                node.client = null;
            }
            done();
        });
    }

    RED.nodes.registerType("stream", StreamNode);
}
