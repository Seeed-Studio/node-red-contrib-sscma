module.exports = function (RED) {
    'use strict';

    function CameraNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        node.client = RED.nodes.getNode(n.client);
        node.config = {
            option: n.option || 0,
            preview: false
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

    RED.nodes.registerType("camera", CameraNode);
}
