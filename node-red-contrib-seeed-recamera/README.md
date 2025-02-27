![Platform Node-RED](https://img.shields.io/badge/Platform-Node--RED-red.png)

## Installation

To install the package in Node-RED, run the following command:

```bash
npm install node-red-contrib-seeed-recamera
```

Or install directly through the Node-RED interface.

### Motor Config

Input motor parameters value for reCamera Gimbal, and output control motor CAN data frame according to the protocol.

-   Name: Custom naming.
-   Input: Access node information.
-   Output: The CAN bus protocol of the selected motor parameter such as absolute position, .

#### Input:

The input data type can be `number string` or `int` which stands for the motor parameters. 
    
- For Absolute Position:
    -  Yaw axis angle (left and right): 0 to 360 degrees.
    -  Pitch axis angle (up and down): 0 to 180 degrees.
    -  Example: parsing in  `180` to `Yaw Axis Absolute Position (deg)` means that the yaw axis angle will move to 180 degrees.
- For Relative Offset:
    -  Yaw axis angle (left and right): -360 to 360 degrees.
    -  Pitch axis angle (up and down): -180 to 180 degrees.
    -  Example: parsing in  `5` to `Yaw Axis Relative Offset (deg)` means that the yaw axis angle will move 5 degrees to the right.
- For Speed Setpoint:
    -  Yaw axis speed(left and right): 0 to 65535 dps/LSB.
    -  Pitch axis speed(up and down): 0 to 65535 dps/LSB.
    -  Example: parsing in  `100` to `Yaw Axis Speed Setpoint` means that the yaw axis speed will be set to 10000 dps/LSB.

> Note: Due to hardware limitations, please avoid setting the config for Yaw motor at 0 or 360 degrees, Pitch motor at 0 or 180 degrees for a continuous time frame, in case overloading the motors.

#### Output:

The output data is a CAN frame in hexadecimal format. The CAN frame is composed of `ID#Payload Data`.
-   ID: The ID of the CAN frame is 0x141 for Yaw axis and 0x142 for Pitch axis.
-   Payload Data: The payload data is composed of 8 bytes, each byte is a hexadecimal value. 

For **absolute position and speed**, A6 command is used:
Output is `${motorId}#A6.${direction}.${speedHex}.${angleHex}`

With A6 command, The host sends this command to control the position (single - turn angle) of the motor. 
The control value spinDirection sets the rotation direction of the motor. It is of uint8_t type. 0x00 represents clockwise rotation, and 0x01 represents counterclockwise rotation.
angleControl is of uint32_t type. The corresponding actual position is 0.01 degree/LSB, that is, 36000 represents 360°.
The speed control value maxSpeed limits the maximum rotation speed of the motor. It is of uint16_t type. The corresponding actual rotation speed is 1dps/LSB, that is, 360 represents 360dps.

| Data Field | Description                             | Data                                      |
| ---------- | --------------------------------------- | ----------------------------------------- |
| DATA[0]    | Command Byte                            | 0xA6                                      |
| DATA[1]    | Rotation Direction Byte                 | DATA[1] = spinDirection                   |
| DATA[2]    | Speed Limit Byte 1 (bit0 : bit7)        | DATA[2] = *(uint8_t *)(&maxSpeed)         |
| DATA[3]    | Speed Limit Byte 2 (bit8 : bit15)       | DATA[3] = *((uint8_t *)(&maxSpeed)+1)     |
| DATA[4]    | Position Control Byte 1 (bit0 : bit7)   | DATA[4] = *(uint8_t *)(&angleControl)     |
| DATA[5]    | Position Control Byte 2 (bit8 : bit15)  | DATA[5] = *((uint8_t *)(&angleControl)+1) |
| DATA[6]    | Position Control Byte 3 (bit16 : bit23) | DATA[6] = *((uint8_t *)(&angleControl)+2) |
| DATA[7]    | Position Control Byte 4 (bit24: bit31)  | DATA[7] = *((uint8_t *)(&angleControl)+3) |


For **relative offset and speed**, A8 command is used:
Output is `${motorId}#A8.00.${speedHex}.${offsetHex}`

With A8 command, the host sends this command to control the position increment of the motor.

The control value angleIncrement is of int32_t type. The corresponding actual position is 0.01 degree/LSB, that is, 36000 represents 360°. The rotation direction of the motor is determined by the sign of this parameter.
The control value maxSpeed limits the maximum rotation speed of the motor. It is of uint32_t type. The corresponding actual rotation speed is 1dps/LSB, that is, 360 represents 360dps.

| Data Field | Description                   | Data                                        |
| ---------- | ----------------------------- | ------------------------------------------- |
| DATA[0]    | Command Byte                  | 0xA8                                        |
| DATA[1]    | NULL                          | 0x00                                        |
| DATA[2]    | Low Byte of Speed Limit       | DATA[2] = *(uint8_t *)(&maxSpeed)           |
| DATA[3]    | High Byte of Speed Limit      | DATA[3] = *((uint8_t *)(&maxSpeed)+1)       |
| DATA[4]    | Low Byte of Position Control  | DATA[4] = *(uint8_t *)(&angleIncrement)     |
| DATA[5]    | Position Control              | DATA[5] = *((uint8_t *)(&angleIncrement)+1) |
| DATA[6]    | Position Control              | DATA[6] = *((uint8_t *)(&angleIncrement)+2) |
| DATA[7]    | High Byte of Position Control | DATA[7] = *((uint8_t *)(&angleIncrement)+3) |

If no speed value is passed in, the default speed value is 300.

For example:

-   Yaw axis angle (Left and right): 180
-   Yaw axis speed(Left and right): 300

output : `141#A4.00.2C.01.10.27.00.00`

-   Pitch axis angle (Left and right): 180
-   Pitch axis speed(Left and right): 300

output : `142#A4.00.2C.01.10.27.00.00`


### Light

This is the Light node for the build-in fill light on reCamera.

#### Input

Parse in ' msg.payload = on ' to start light, and ' msg.payload = off ' to stop light.

#### Output

No output.

## License

This project is licensed under the Apache License 2.0. 