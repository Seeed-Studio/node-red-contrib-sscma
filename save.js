const { parse } = require("acorn");
const { slice } = require("cheerio/lib/api/traversing");
const { Store } = require("mqtt");

module.exports = function (RED) {
    function SaveNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.client = RED.nodes.getNode(config.client);
        node.config = {
            storage: config.storage,
            slice: +config.slice
        }

        node.receive = function (msg) {
            node.send(msg);
        }


        
        if (node.client) {
            node.client.register(node);
        }

        node.on('close', function (removed, done) {
            if (node.client) {
                node.client.deregister(node, done, removed);
                node.client = null;
            }
            done();
        });
    }

    RED.nodes.registerType("save", SaveNode);
}
