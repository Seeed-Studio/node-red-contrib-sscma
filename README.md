![Platform Node-RED](https://img.shields.io/badge/Platform-Node--RED-red.png)

# node-red-contrib-nodes

`node-red-contrib-nodes` is a comprehensive Node-RED repository under the Seeed-Studio organization, hosting various Node-RED nodes for diverse functionalities, including AI model deployment, device integration, and IoT ecosystem interconnection.

## Features

- **AI Model Deployment**: Easily deploy AI models using Node-RED's flow-based programming interface, making it accessible for users with minimal coding experience.
- **Device Integration**: Connect the outputs of AI models to a wide range of devices and services, allowing for real-time automation and decision-making.
- **Flow-based Programming**: Leverage the visual programming paradigm of Node-RED to design and deploy complex AI workflows quickly and efficiently.
- **Flexible Interconnection**: Utilize AI-driven data to communicate and control various devices in an IoT ecosystem.

## Installation

To install any of the packages in Node-RED, run the following command:
```
cd <package-name>
npm install <package-name>
```
Or install directly through the Node-RED interface.
## Packages

- **node-red-contrib-sscma**: For AI model deployment.
- **node-red-contrib-seeed-canbus**: For CAN bus integration.
- **node-red-contrib-seeed-recamera**: For camera interface integration.

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
