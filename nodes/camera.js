module.exports = function (RED) {
    'use strict';

    function CameraNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        node.client = RED.nodes.getNode(n.client);
        node.config = [
            {
                channel: 0,
                enabled: false

            },
            {
                channel: 1,
                enabled: false
            },
            {
                channel: 2,
                width: +n.width || 640,
                height: +n.height || 480,
                fps: +n.fps || 30,
                enabled: false
            }
        ]

        RED.nodes.eachNode((n) => {
            if (node.wires.some(w => w.includes(n.id))) {
                if (n.d) { 
                    return;
                }
                if (n.type == 'model') {
                    node.config[0].enabled = true
                }else if (n.type == 'save' || n.type == 'stream') {
                    node.config[2].enabled = true
                }
            }
        })

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
