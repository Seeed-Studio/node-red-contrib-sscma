![Platform Node-RED](https://img.shields.io/badge/Platform-Node--RED-red.png)

# node-red-contrib-sscma

`node-red-contrib-sscma` is a Node-RED node component designed to facilitate the quick deployment of AI models through flow-based programming. This allows for seamless integration of AI model outputs with other devices, enabling smart automation and intelligent workflows.

## Features

- **AI Model Deployment**: Easily deploy AI models using Node-RED's flow-based programming interface, making it accessible for users with minimal coding experience.
- **Device Integration**: Connect the outputs of AI models to a wide range of devices and services, allowing for real-time automation and decision-making.
- **Flow-based Programming**: Leverage the visual programming paradigm of Node-RED to design and deploy complex AI workflows quickly and efficiently.
- **Flexible Interconnection**: Utilize AI-driven data to communicate and control various devices in an IoT ecosystem.

## Installation

To install the package in Node-RED, run the following command:

```bash
npm install node-red-contrib-sscma
```

Or install directly through the Node-RED interface.

## Getting Started

1. Open Node-RED and navigate to the flow editor.
2. Drag the `sscma` node into your workspace.
3. Configure the node by selecting the AI model you wish to deploy.
4. Connect the node to other nodes for input/output to interact with devices or services.
5. Deploy the flow to start processing AI data.

<div align="center"><img width="98%" src="https://files.seeedstudio.com/sscma/static/sscma_node_demo.gif"/></div>

## Example

Below is an example of how `node-red-contrib-sscma` can be used in a flow to connect an AI model’s output to a device:

```
[ Camera Node ] → [ Model Node ] → [ Output Device Node ]
```

This flow processes data using an AI model and sends the results to a connected device for further action.

## License

This project is licensed under the Apache License 2.0. 