module.exports = function (RED) {

    function PreviewNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.active = (config.active === null || typeof config.active === "undefined") || config.active;

        node.on("input", function (msg) {
            if (this.active !== true) { return; }
            RED.comms.publish("preview", { id: node.id, data: msg.payload.data });
            if (msg.payload.data.counts) {
                const countA = msg.payload.data.counts[0];
                const countB = msg.payload.data.counts[1];
                const countAB = msg.payload.data.counts[2];
                const countBA = msg.payload.data.counts[3];
                let textContent = `A: ${countA} B: ${countB} A->B: ${countAB} B->A: ${countBA}`
                node.status({ fill: "blue", shape: "dot", text: textContent });
            }
        });

        node.on("close", function () {
            RED.comms.publish("preview", { id: this.id });
            node.status({});
        });
    }
    RED.nodes.registerType("preview", PreviewNode);

    // Via the button on the node (in the FLOW EDITOR), the image pushing can be enabled or disabled
    RED.httpAdmin.post("/image-output/:id/:state", RED.auth.needsPermission("image-output.write"), function (req, res) {
        var state = req.params.state;
        var node = RED.nodes.getNode(req.params.id);

        if (node === null || typeof node === "undefined") {
            res.sendStatus(404);
            return;
        }
        if (state === "enable") {
            node.active = true;
            res.send('activated');
        }
        else if (state === "disable") {
            node.active = false;
            res.send('deactivated');
        }
        else {
            res.sendStatus(404);
        }
    });
};