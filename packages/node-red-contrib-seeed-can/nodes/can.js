const { exec } = require("child_process");
const { getCanInterfaces } = require("../utils/ifconfig");
const CommandExecutor = require("../utils/CommandExecutor");
const runCommand = require("../utils/runCommand");

module.exports = function (RED) {
    const listeners = {};
    function CanNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.can = config;

        node.addlistener = (id, listener) => {
            listeners[id] = listener;
        };

        const commandExecutor = new CommandExecutor("candump", [config.interface]);

        commandExecutor.on("data", (stdType, data) => {
            if (stdType === "stderr") {
                node.error(`candump stderr: ${data}`);
                return;
            }
            const lines = data.toString().split("\n");
            lines.forEach((line) => {
                if (!line) {
                    return;
                }
                Object.values(listeners).forEach((listener) => {
                    if (typeof listener === "function") {
                        listener(line);
                    }
                });
            });
        });
        commandExecutor.on("error", (error) => {
            node.error(`candump error: ${error.message}`);
        });

        (async () => {
            await runCommand(`ip link set ${config.interface} down`).catch((error) => {
                node.error(`ip link set ${config.interface} down error: ${error.message}`);
            });
            await runCommand(`ip link set ${config.interface} up type can bitrate ${config.baud}`).catch((error) => {
                node.error(`ip link set ${config.interface} up type can bitrate ${config.baud} error: ${error.message}`);
            });
            await runCommand(`ip link set ${config.interface} up`).catch((error) => {
                node.error(`ip link set ${config.interface} up error: ${error.message}`);
            });
            commandExecutor.start().catch((error) => {
                node.error(`candump error: ${error.message}`);
            });
        })();

        node.on("close", () => {
            exec(`ip link set ${config.interface} down`);
            commandExecutor.stop();
        });
    }

    RED.httpAdmin.get("/ifconfig", RED.auth.needsPermission("write.read"), function (req, res) {
        const { interfaceName } = req.query ?? {};
        getCanInterfaces(interfaceName).then((interfaceNames) => {
            res.send(interfaceNames);
        });
    });

    RED.nodes.registerType("can", CanNode);
};
