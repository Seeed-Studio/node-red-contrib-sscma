/**
 * @typedef {import('node-red')} NodeRED
 * @typedef {import('node-red').Node} Node
 * @typedef {import('node-red').NodeDef} NodeDef
 */

/**
 * @param {NodeRED} RED - Node-RED 实例
 */
module.exports = function (RED) {
  'use strict';

  function CameraNode(n) {
    RED.nodes.createNode(this, n);
    const node = this;
    node.client = RED.nodes.getNode(n.client);
    node.config = {
      option: n.option || 0,
      preview: false,
      light: 0,
    };

    // if connect to preview, set preview to true
    node.wires.forEach((wires) => {
      wires.forEach((wire) => {
        RED.nodes.eachNode(function (n) {
          if (n.id === wire && n.type === 'preview' && !n.d) {
            node.config.preview = true;
          }
        });
      });
    });
    node.message = function (msg) {
      node.send(msg);
    };

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
    // Via the button on the node (in the FLOW EDITOR), the image pushing can be enabled or disabled
    RED.httpAdmin.post(
      '/camera/:id/:state',
      RED.auth.needsPermission('camera.write'),
      function (req, res) {
        try {
          const id = req.params.id;
          const state = req.params.state;
          if (node === null) {
            res.status(404).send('Node not found');
            return;
          }
          const status = state === 'on' ? 1 : 0;
          node.client.request(id, 'light', status, (mqttRes) => {
            if (mqttRes === 'ok') {
              res.send(status ? 'on' : 'off');
            } else {
              res.status(500).send(`Failed to turn ${state}`);
            }
          });

          // if (state === 'on') {
          //   node.client.request(node.id, 'light', 1);
          //   res.send('on');
          // } else if (state === 'off') {
          //   node.client.request(node.id, 'light', 0);
          //   res.send('off');
          // } else {
          //   res.status(400).send('Invalid state');
          // }
        } catch (error) {
          res.status(500).send(error.message);
        }
      },
    );
  }

  RED.nodes.registerType('camera', CameraNode);
};
