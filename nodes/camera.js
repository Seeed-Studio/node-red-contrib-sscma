const { option } = require("grunt");

module.exports = function (RED) {
    'use strict';

    function CameraNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        node.client = RED.nodes.getNode(n.client);
        node.config = {
            option: n.option || 0
        }

        node.receive = function (msg) {
            if (msg.type == 'sscma' && msg.payload.code == 0) {
                const payload = {
                    type: "node",
                    payload: {
                        type: "camera",
                        id: node.id,
                    }
                }
                node.send(payload);
            }
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
