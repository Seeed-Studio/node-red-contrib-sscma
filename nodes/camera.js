module.exports = function (RED) {
    'use strict';

    function CameraNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        node.client = RED.nodes.getNode(n.client);
        node.config = {
            option: n.option || 0,
            preview: false,
            light: n.active ? 1 : 0
        }

        // if connect to preview, set preview to true
        node.wires.forEach(wires => {
            wires.forEach(wire => {
                RED.nodes.eachNode(function (n) {
                    if (n.id === wire && n.type === "preview" && !n.d) {
                        node.config.preview = true
                    }
                });
            });
        });

        node.message = function (msg) {
            node.send(msg);
        }

        if (node.client) {
            node.client.register(node);
        }

        node.on('close', function (removed, done) {
            if (node.client) {
                node.client.deregister(node, done, removed);
            } else {
                done();
            }
        });

    }

    // Via the button on the node (in the FLOW EDITOR), the image pushing can be enabled or disabled
    RED.httpAdmin.post("/camera/:id/:state", RED.auth.needsPermission('camera.write'), function (req, res) {
        var id = req.params.id;
        var state = req.params.state;
        var node = RED.nodes.getNode(id);
        if (node === null) {
            res.send(404);
            return;
        }
        if (state === "on") {
            node.config.light = 1;
            node.client.request(node.id, "light", node.config.light);
            res.send("on");
        } else if (state === "off") {
            node.config.light = 0;
            node.client.request(node.id, "light", node.config.light);
            res.send("off");
        } else {
            res.send(200);
        }
    });

    RED.nodes.registerType("camera", CameraNode);
}
