import express from "express";
import https from "https";
import http from "http";
const app = express();
import fs from "fs";
import ip from "ip";
import { WebSocketServer } from "ws";
import * as BS from "brilliantsole/node";
import osc from "osc";
import * as THREE from "three";

// HTTPS SERVER
app.use(function (req, res, next) {
  res.header("Cross-Origin-Opener-Policy", "same-origin");
  res.header("x-frame-options", "same-origin");

  next();
});
app.use(express.static("./"));
app.use(express.json());

const serverOptions = {
  key: fs.readFileSync("./sec/key.pem"),
  cert: fs.readFileSync("./sec/cert.pem"),
};

const httpServer = http.createServer(app);
httpServer.listen(80);
const httpsServer = https.createServer(serverOptions, app);
httpsServer.listen(443, () => {
  console.log(`server listening on https://${ip.address()}`);
});

// WEBSOCKET
const wss = new WebSocketServer({ server: httpsServer });
const webSocketServer = new BS.WebSocketServer();
webSocketServer.clearSensorConfigurationsWhenNoClients = false;
webSocketServer.server = wss;

const sendPort = 9000;
const receivePort = 9001;
const localAddress = "0.0.0.0";
const sendAddress = "192.168.1.201"; // replace with your IP

// OSC
const oscServer = new osc.UDPPort({
  localAddress: localAddress,
  localPort: receivePort,
  metadata: true,
});

oscServer.on("message", function (oscMsg, timeTag, info) {
  console.log("received message", oscMsg);

  const address = oscMsg.address.split("/").filter(Boolean);
  const { args } = oscMsg; // [...{type, value}]

  // for receiving messages
});

oscServer.open();

const devicePair = BS.DevicePair.shared;

const eulers = {
  left: new THREE.Euler(0, 0, 0, "ZXY"),
  right: new THREE.Euler(0, 0, 0, "ZXY"),
};

const inverseGameRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};
const gameRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};
const gameRotationEuler = {
  left: new THREE.Euler(0, 0, 0, "YXZ"),
  right: new THREE.Euler(0, 0, 0, "YXZ"),
};
const latestGameRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};

const inverseRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};
const rotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};
const rotationEuler = {
  left: new THREE.Euler(0, 0, 0, "YXZ"),
  right: new THREE.Euler(0, 0, 0, "YXZ"),
};
const latestRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};

function resetGameRotation() {
  BS.InsoleSides.forEach((side) => {
    gameRotationEuler[side].setFromQuaternion(latestGameRotation[side]);
    gameRotationEuler[side].x = gameRotation[side].z = 0;
    gameRotationEuler[side].y *= -1;
    inverseGameRotation[side].setFromEuler(gameRotationEuler[side]);
  });
}
function resetRotation() {
  BS.InsoleSides.forEach((side) => {
    rotationEuler[side].setFromQuaternion(latestRotation[side]);
    rotationEuler[side].x = rotation[side].z = 0;
    rotationEuler[side].y *= -1;
    inverseRotation[side].setFromEuler(rotationEuler[side]);
  });
}
app.get("/resetRotation", (req, res) => {
  console.log("resetting rotation");
  resetGameRotation();
  resetRotation();
  res.send();
});
app.post("/trackingOffset", (req, res) => {
  const { widthOffset, heightOffset } = req.body;

  if (typeof widthOffset === "number") {
    console.log({ widthOffset });
    trackingOffset.width = widthOffset;
  }
  if (typeof heightOffset === "number") {
    console.log({ heightOffset });
    trackingOffset.height = heightOffset;
  }

  res.send();
});

const trackingOffset = {
  width: 0.08,
  height: -0.6,
};
const trackingIndex = {
  left: 1,
  right: 2,
};

oscServer.on("ready", function () {
  devicePair.addEventListener("deviceSensorData", (event) => {
    const { side, sensorType } = event.message;
    let args;
    let isRotation = false;
    switch (sensorType) {
      case "gameRotation":
        {
          const quaternion = gameRotation[side];
          quaternion.copy(event.message.gameRotation);
          quaternion.premultiply(inverseGameRotation[side]);

          const euler = eulers[side];
          euler.setFromQuaternion(quaternion);
          const [pitch, yaw, roll, order] = euler.toArray();
          args = [-pitch, -yaw, roll].map((value) => {
            return {
              type: "f",
              value: THREE.MathUtils.radToDeg(value),
            };
          });
          latestGameRotation[side].copy(event.message.gameRotation);
          isRotation = true;
        }
        break;
      case "rotation":
        {
          const quaternion = rotation[side];
          quaternion.copy(event.message.rotation);
          quaternion.premultiply(inverseRotation[side]);

          const euler = eulers[side];
          euler.setFromQuaternion(quaternion);
          const [pitch, yaw, roll, order] = euler.toArray();
          args = [-pitch, -yaw, roll].map((value) => {
            return {
              type: "f",
              value: THREE.MathUtils.radToDeg(value),
            };
          });
          latestRotation[side].copy(event.message.rotation);
          isRotation = true;
        }
        break;
      case "linearAcceleration":
        {
          const { x, y, z } = event.message.linearAcceleration;
          args = [x, y, z].map((value) => {
            return {
              type: "f",
              value,
            };
          });
        }
        break;
      case "gyroscope":
        {
          const { x, y, z } = event.message.gyroscope;
          args = [x, y, z].map((value) => {
            return {
              type: "f",
              value,
            };
          });
        }
        break;
      case "magnetometer":
        {
          const { x, y, z } = event.message.magnetometer;
          args = [x, y, z].map((value) => {
            return {
              type: "f",
              value,
            };
          });
        }
        break;
      case "pressure":
        oscServer.send(
          {
            address: `/tracking/trackers/${trackingIndex[side]}/pressureSum`,
            args: [
              {
                type: "f",
                value: event.message.pressure.normalizedSum,
              },
            ],
          },
          sendAddress,
          sendPort
        );

        if (event.message.pressure.normalizedCenter && event.message.pressure.normalizedSum > 0.01) {
          oscServer.send(
            {
              address: `/tracking/trackers/${trackingIndex[side]}/centerOfPressure`,
              args: [
                {
                  type: "f",
                  value: event.message.pressure.normalizedCenter.x,
                },
                {
                  type: "f",
                  value: event.message.pressure.normalizedCenter.y,
                },
              ],
            },
            sendAddress,
            sendPort
          );
        }

        args = [];
        event.message.pressure.sensors.forEach((sensor) => {
          args.push({
            type: "f",
            value: sensor.normalizedValue,
          });
        });
        break;
      default:
        break;
    }

    if (!args) {
      return;
    }

    oscServer.send(
      {
        address: `/brilliantsole/${side}/${sensorType}`,
        args,
      },
      sendAddress,
      sendPort
    );

    if (isRotation) {
      if (sensorType == "gameRotation" && event.message.device.sensorConfiguration.rotation != 0) {
        console.warn("not using gameRotation data to rotate foot - rotation data is already enabled");
        return;
      }

      oscServer.send(
        {
          address: `/tracking/trackers/${trackingIndex[side]}/rotation`,
          args,
        },
        sendAddress,
        sendPort
      );
      oscServer.send(
        {
          address: `/tracking/trackers/${trackingIndex[side]}/position`,
          args: [
            { type: "f", value: side == "left" ? -trackingOffset.width : trackingOffset.width },
            { type: "f", value: trackingOffset.height },
            { type: "f", value: 0 },
          ],
        },
        sendAddress,
        sendPort
      );
    }
  });

  devicePair.addEventListener("pressure", (event) => {
    // FILL - use center of pressure to move around
  });
});
