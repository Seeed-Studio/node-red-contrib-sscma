const http = require("http");

module.exports = function (RED) {
    "use strict";

    /**
     * Send HTTP request to control the camera light
     * @param {string} state - Light state ("on" or "off")
     * @returns {Promise<void>}
     */
    function sendLightRequest(state) {
        return new Promise((resolve, reject) => {
            const req = http.request(
                {
                    method: "POST",
                    path: `/camera/${state}`,
                    port: 1880,
                    host: "localhost",
                },
                (res) => {
                    // Handle response
                    if (res.statusCode === 200) {
                        resolve();
                    } else {
                        reject(new Error(`HTTP error: ${res.statusCode}`));
                    }
                },
            );

            // Handle request errors
            req.on("error", (err) => {
                reject(err);
            });

            // Complete the request
            req.end();
        });
    }

    /**
     * Light Node implementation
     * @param {Object} config - Node configuration
     */
    function LightNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Initialize node properties
        node.light = config.light;
        node.config = {
            light: config.light ? 1 : 0,
        };

        // Set initial light state on deploy
        sendLightRequest(node.light ? "on" : "off")
            .then(() => {
                node.status({ fill: "green", shape: "dot", text: "Light is on" });
            })
            .catch((err) => {
                node.status({ fill: "red", shape: "ring", text: "Light is off" });
            });

        // Handle input messages
        node.on("input", function (msg) {
            // Determine light state from message payload
            let newState = "off";
            if (msg.payload === "on" || (!!msg.payload && msg.payload !== "off")) {
                newState = "on";
            }

            // Only send request if state has changed
            if ((newState === "on") !== node.light) {
                node.light = newState === "on";

                // Update light state
                sendLightRequest(newState)
                    .then(() => {
                        node.status({ fill: "green", shape: "dot", text: "Light is on" });
                    })
                    .catch((err) => {
                        node.status({ fill: "red", shape: "ring", text: "Light is off" });
                    });
            }
        });
    }

    // Register the node type
    RED.nodes.registerType("light", LightNode);
};
