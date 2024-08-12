module.exports = function (RED) {
    function CameraNode(config) {
        RED.nodes.createNode(this, config);

        console.log("config: " + JSON.stringify(config))
    }

    RED.nodes.registerType("camera", CameraNode);
}
