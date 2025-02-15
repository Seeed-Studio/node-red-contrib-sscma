const http = require("http");
/**
 * @typedef {import('node-red')} NodeRED
 * @typedef {import('node-red').Node} Node
 * @typedef {import('node-red').NodeDef} NodeDef
 */

/**
 * @param {NodeRED} RED - Node-RED 实例
 */
module.exports = function (RED) {
    "use strict";

    function request(state) {
        const req = http.request({
            method: "POST",
            path: `/camera/${state}`,
            port: 1880,
            host: "localhost",
        });
        // 结束请求
        req.end();
    }

    function LightNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.light = config.light;
        node.config = {
            light: config.light ? 1 : 0,
        };
        request(node.light ? "on" : "off");
        node.on("input", function (msg) {
            let state = "off";
            if (msg.payload === "on" || (!!msg.payload && state !== "off")) {
                state = "on";
            }
            node.light = state === "on";
            request(state);
        });
    }
    RED.nodes.registerType("light", LightNode);
};
