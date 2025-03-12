const { exec } = require("child_process");
const { getCanInterfaces, runCommand } = require("../utils/can_utils");

module.exports = function (RED) {
    function CanConfigNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.can = config;

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

        node.on("close", () => {
            exec(`ip link set ${config.interface} down`);
        });
    }

    RED.httpAdmin.get("/ifconfig", RED.auth.needsPermission("write.read"), function (req, res) {
        const { interfaceName } = req.query ?? {};
        getCanInterfaces(interfaceName).then((interfaceNames) => {
            res.send(interfaceNames);
        });
    });

    RED.nodes.registerType("can-config", CanConfigNode);
};
