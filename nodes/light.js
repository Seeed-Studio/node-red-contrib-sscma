const http = require('http');
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
  function LightNode(n) {
    const node = this;
    node.on('input', function (msg) {
      let state = 'off';
      if (msg.payload === 'on' || !!msg.payload) {
        console.log('light on');
        state = 'on';
      } else {
        console.log('light off');
      }
      node.light = state === 'on';
      const req = http.request({
        method: 'POST',
        path: `/camera/${node.id}/${state}`,
        port: 1880,
        host: 'localhost',
      });
      // 结束请求
      req.end();
    });
  }
  RED.nodes.registerType('light', LightNode);
};
