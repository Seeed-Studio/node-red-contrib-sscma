const { exec } = require("child_process");

function getCanInterfaces(interfaceName = "can") {
    return new Promise((resolve, reject) => {
        exec("ifconfig -a", (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            const interfaces = [];
            const lines = stdout.split("\n");
            let currentInterface = null;

            for (const line of lines) {
                // macOS 格式: "en0: flags=8863<UP,BROADCAST,..."
                // Linux 格式: "can0      Link encap:UNSPEC  HWaddr..."
                const interfaceMatch = line.match(/^(\S+)[\s:]/) || line.match(/^(\S+)\s+Link/);

                if (interfaceMatch) {
                    currentInterface = interfaceMatch[1].trim();
                    // 如果是以 ${interfaceName} 开头的接口，添加到结果中
                    if (currentInterface.toLowerCase().startsWith(interfaceName)) {
                        if (currentInterface[currentInterface.length - 1] === ":") {
                            currentInterface = currentInterface.slice(0, -1);
                        }
                        interfaces.push(currentInterface);
                    }
                }
            }

            resolve(interfaces);
        });
    });
}

module.exports = {
    getCanInterfaces,
};
