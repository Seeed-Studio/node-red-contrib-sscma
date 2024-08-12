module.exports = function (RED) {
    function ModelNode(config) {
        RED.nodes.createNode(this, config);

        console.log("config: " + JSON.stringify(config))
    }

    RED.nodes.registerType("model", ModelNode);
}
