const fs = require("fs").promises;
const path = require("path");

module.exports = function (RED) {
    async function writeToFile(filePath, content) {
        try {
            const directory = path.dirname(filePath);
            await fs.mkdir(directory, { recursive: true });
            await fs.writeFile(filePath, content);
        } catch (error) {
            RED.log.error(`写入文件时发生错误:${error}`);
            throw error;
        }
    }
    function writeNode(config) {
        RED.nodes.createNode(this, config);

        const node = this;
        let timer = null;
        let count = 1;
        const clean = () => {
            if (timer) {
                clearInterval(timer);
            }
            timer = null;
            count = 1;
        };
        // Save locally first, and later switch to retrieving the previous position.
        let lastMoveData = null;
        node.on("input", function (msg) {
            if (typeof msg?.payload !== "object") {
                return;
            }
            const { yaw_angle, yaw_speed, pitch_angle, pitch_speed } = msg.payload;
            const moveDataStr = `${yaw_angle}##${yaw_speed}##${pitch_angle}##${pitch_speed}`;
            if (moveDataStr === lastMoveData) {
                return;
            }
            lastMoveData = moveDataStr;
            let action = "";
            if (yaw_angle) {
                action += `1_${yaw_angle}_${yaw_speed ?? 90}`;
            }
            if (pitch_angle) {
                if (action) {
                    action += "+";
                }
                action += `2_${pitch_angle}_${pitch_speed ?? 90}`;
            }
            clean();
            if (!action) {
                return;
            }
            timer = setInterval(() => {
                if (count === 5) {
                    clean();
                }
                if (count < 5) {
                    count += 1;
                }
                writeToFile("/home/recamera/jiaodu.txt", action);
            }, 80);
        });
    }

    RED.nodes.registerType("write", writeNode);
};
