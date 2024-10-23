module.exports = function (RED) {
    function StreamNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.client = RED.nodes.getNode(config.client);
        node.config = {
            protocol: config.protocol,
            port: +config.port,
            session: config.session,
            username: config.username,
            password: config.password
        }

        node.message = function (msg) {

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

    RED.nodes.registerType("stream", StreamNode);
}
