module.exports = function (RED) {

    function PreviewNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.enabled = true;
        this.active = (config.active === null || typeof config.active === "undefined") || config.active;

        node.on("input", function (msg) {
            if (this.active !== true || this.enabled !== true) { return; }
            if (msg.payload.name === "invoke" || msg.payload.name === "sample") {
                if (msg.payload.data.count % 30 === 0) {
                    node.enabled = false;
                }
                RED.comms.publish("preview", { id: node.id, data: msg.payload.data });
                if (msg.payload.data.counts) {
                    const countA = msg.payload.data.counts[0];
                    const countB = msg.payload.data.counts[1];
                    const countAB = msg.payload.data.counts[2];
                    const countBA = msg.payload.data.counts[3];
                    let textContent = `A: ${countA} B: ${countB} A->B: ${countAB} B->A: ${countBA}`
                    node.status({ fill: "blue", shape: "dot", text: textContent });
                }
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
            // set all the preview node's active state
            RED.nodes.eachNode(function (n) {
                var node = RED.nodes.getNode(n.id);
                if(node === null){
                    return;
                }
                if (n.type === "preview") {
                    if (state === "start") {
                        node.enabled = true;
                    }
                    else if (state === "stop") {
                        node.enabled = false;
                    }
                }
            })
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
        else if (state === "start") {
            node.enabled = true;
            res.send('started');
        } else if (state === "stop") {
            node.enabled = false;
            res.send('stopped');
        }
        else {
            res.sendStatus(404);
        }
    });

};