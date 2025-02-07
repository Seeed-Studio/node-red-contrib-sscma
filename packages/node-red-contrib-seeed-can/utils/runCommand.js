const util = require("util");
const { exec } = require("child_process");

// 将 exec 转换为 Promise 形式
const execAsync = util.promisify(exec);

async function runCommand(command) {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
        throw new Error(stderr);
    }
    return stdout;
}

module.exports = runCommand;
