require('dotenv').config({
  path: require('path').join(__dirname, '../.env')
});
const os = require("os");
const fs = require("fs");
const path = require("path");
const Docker = require('dockerode');


const WORK_DIR = process.env.WORK_DIR;

class BuildContext {
  constructor(userId, appName) {

    this.userId = userId;
    this.appName = appName;

    this.appId = `${userId}-${appName}`;
    this.workDir = path.join(
      process.env.BASE_DIR || path.join(__dirname, "../"), "users", userId, appName
    );

    this.language = null;
    this.runtimeVersion = null;
    this.baseImage = null;
    this.image = null;

    this.entrypoint = null;

    this.containerName = `user-${this.appId}-app`;
    this.imageRepo = `user-${this.appId}-image`;
    this.fullImage = `${this.imageRepo}:latest`;

    // Simple logging utility for detectRuntime
    this.log = (msg) => console.log(msg);
  }
}

function detectRuntime(ctx, callback) {
  ctx.log("Detecting runtime...");

  fs.readdir(ctx.workDir, (err, files) => {
    if (err) {
      ctx.status = "error";
      return callback(err);
    }

    if (files.includes("requirements.txt")) {
      ctx.language = "python";

      const runtimePath = path.join(ctx.workDir, "runtime.txt");

      fs.readFile(runtimePath, "utf-8", (err, data) => {
        let version = "3.11";

        if (!err && data.startsWith("Python")) {
          version = data.replace("Python", "").trim();
        }

        ctx.runtimeVersion = version;
        ctx.baseImage = `python:${version}-slim`;

        if (!ctx.runCmd) {
          ctx.runCmd = ["python", ctx.entrypoint];
        }

        ctx.log(`Detected Python ${version}`);
        return callback(null, ctx);
      });

      return;
    }

    if (files.includes("package.json")) {
      ctx.language = "node";

      const runtimePath = path.join(ctx.workDir, "runtime.txt");

      fs.readFile(runtimePath, "utf-8", (err, data) => {
        let version = "18";

        if (!err && data.startsWith("v")) {
          version = data.replace("v", "").trim();
        }

        ctx.runtimeVersion = version;
        ctx.baseImage = `node:${version}-alpine`;

        if (!ctx.entrypoint) {
          const pkgPath = path.join(ctx.workDir, "package.json");

          fs.readFile(pkgPath, "utf-8", (err, pkgData) => {
            try {
              const pkg = JSON.parse(pkgData);
              ctx.entrypoint = pkg.main || "index.js";
            } catch {
              ctx.entrypoint = "index.js";
            }

            if (!ctx.runCmd) {
              ctx.runCmd = ["node", ctx.entrypoint];
            }

            ctx.log(`Detected Node ${version}`);
            return callback(null, ctx);
          });
        } else {
          if (!ctx.runCmd) {
            ctx.runCmd = ["node", ctx.entrypoint];
          }

          ctx.log(`Detected Node ${version}`);
          return callback(null, ctx);
        }
      });

      return;
    }

    return callback(new Error("No supported runtime detected"));
  });
}


function readWorkerfile(ctx) {

}


async function orchestration(ctx) {
  const docker = new Docker();
  const containerName = `user-${ctx.userId}-app`;
  const imageRepo = `user-${ctx.userId}-image`;
  const imageTag = 'latest';
  const fullImage = `${imageRepo}:${imageTag}`;

  try {
    try {
      await docker.getContainer(containerName).remove({ force: true });
    } catch (e) { }

    try {
      await docker.getImage(ctx.image).inspect();
    } catch (e) {
      console.log('Pulling image...');
      await new Promise((resolve, reject) => {
        docker.pull(ctx.image, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    }

    console.log('Installing dependencies...');
    const buildContainer = await docker.createContainer({
      Image: ctx.image,
      Cmd: ['pip', 'install', '--no-cache-dir', '-r', 'requirements.txt'],
      WorkingDir: '/app',
      HostConfig: {
        Binds: [`${WORK_DIR}:/app`]
      }
    });

    await buildContainer.start();
    await buildContainer.wait();

    console.log('Committing image...');
    await buildContainer.commit({
      repo: imageRepo,
      tag: imageTag
    });

    await buildContainer.remove();

    const appContainer = await docker.createContainer({
      Image: fullImage,
      name: containerName,

      Cmd: ['python', ctx.entrypoint],

      WorkingDir: '/app',

      Env: [
        `PORT=3000`,
        `USER_ID=${ctx.userId}`
      ],

      HostConfig: {
        Binds: [`${WORK_DIR}:/app`],

        Memory: 512 * 1024 * 1024,
        MemorySwap: 512 * 1024 * 1024,
        NanoCpus: 500000000,
        PidsLimit: 100,

        RestartPolicy: {
          Name: "unless-stopped"
        },

        NetworkMode: 'bridge',
        CapDrop: ['ALL']
      },

      Tty: false,
      OpenStdin: false,
      AttachStdout: true,
      AttachStderr: true,

      User: '1000:1000'
    });

    await appContainer.start();

    console.log('Running:', appContainer.id);

    const stream = await appContainer.logs({
      follow: true,
      stdout: true,
      stderr: true
    });

    appContainer.modem.demuxStream(stream, process.stdout, process.stderr);

  } catch (err) {
    console.error('Error:', err);
  }
}

//detectRuntime(WORK_DIR);
//createDockerfile("python:3.12.0","main.py");
const ctx = new BuildContext("lakshit-escrowbot", "escrowbot");
ctx.image = "python:3.11-slim";
ctx.entrypoint = "main.py";
orchestration(ctx);

