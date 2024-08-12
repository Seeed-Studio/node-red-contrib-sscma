module.exports = function (RED) {
    function StreamNode(config) {
        RED.nodes.createNode(this, config);

        console.log("config: " + JSON.stringify(config))
    }

    RED.nodes.registerType("stream", StreamNode);
}
