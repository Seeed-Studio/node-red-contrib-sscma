const { exec } = require("child_process");
const { getCanInterfaces, runCommand, closeCanChannel } = require("../utils/can_utils");

module.exports = function (RED) {
    function CanConfigNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.can = config;

        // Initialize CAN interface
        (async () => {
            await runCommand(`ip link set ${config.interface} down`).catch((error) => {
                // node.error(`ip link set ${config.interface} down error: ${error.message}`);
            });
            await runCommand(`ip link set ${config.interface} up type can bitrate ${config.baud}`).catch((error) => {
                // node.error(`ip link set ${config.interface} up type can bitrate ${config.baud} error: ${error.message}`);
            });
            await runCommand(`ip link set ${config.interface} up`).catch((error) => {
                // node.error(`ip link set ${config.interface} up error: ${error.message}`);
            });
        })();

        // Handle node closing
        node.on("close", () => {
            try {
                // Close SocketCAN channel
                closeCanChannel();
                
                // Bring interface down
                exec(`ip link set ${config.interface} down`, (error) => {
                    if (error) {
                        node.debug(`Error bringing interface down on close: ${error.message}`);
                    }
                });
            } catch (error) {
                node.debug(`Close error: ${error.message}`);
            }
        });
    }

    // HTTP endpoint to get interface names
    RED.httpAdmin.get("/ifconfig", RED.auth.needsPermission("write.read"), function (req, res) {
        const { interfaceName } = req.query ?? {};
        getCanInterfaces(interfaceName).then((interfaceNames) => {
            res.send(interfaceNames);
        }).catch((error) => {
            res.status(500).send({ error: error.message });
        });
    });

    RED.nodes.registerType("can-config", CanConfigNode);
};
