function checkCanPayloadInput(data, node) {
    if (typeof data !== "string") {
        node.error("Payload must be a string");
        throw new Error("Input is not string");
    }
    const [id, dataToSend] = data.split("#");
    if (!id || !dataToSend) {
        node.error("Payload must be in the format 'id#data'");
        throw new Error("Input format error");
    }
    const items = dataToSend.split(".");
    if (items.length !== 8 || items.every((item) => item.length !== 2)) {
        node.error("Data must be 8 bytes in hexadecimal format");
        throw new Error("Input format error");
    }
    return { id, items };
}

module.exports = {
    checkCanPayloadInput,
};
