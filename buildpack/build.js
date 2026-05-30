require('dotenv').config({
  path: require('path').join(__dirname, '../.env')
});
const os = require("os");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const Docker = require('dockerode');

const WORK_DIR = process.env.WORK_DIR;

class BuildContext {
  constructor(userId, appName, githubUrl = null, envVars = {}) {
    this.userId = userId;
    this.appName = appName;
    this.githubUrl = githubUrl;
    this.envVars = envVars;

    this.appId = `${userId}-${appName}`;
    this.workDir = path.join(
      process.env.BASE_DIR || path.join(__dirname, "../"), "users", userId, appName
    );

    this.language = null;
    this.runtimeVersion = null;
    this.baseImage = null;
    this.installCmd = null;

    this.entrypoint = null;
    this.runCmd = null;

    this.containerName = `user-${this.appId}-app`;
    this.imageRepo = `user-${this.appId}-image`;
    this.fullImage = `${this.imageRepo}:latest`;
  }
}

async function detectRuntime(ctx) {
  console.log("Detecting runtime...");
  const files = await fsPromises.readdir(ctx.workDir);

  if (files.includes("Worker")) {
    try {
      const workerData = await fsPromises.readFile(path.join(ctx.workDir, "Worker"), "utf-8");
      const lines = workerData.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('entrypoint:')) {
          ctx.entrypoint = line.split('entrypoint:')[1].trim();
          console.log(`Parsed entrypoint from Worker file: ${ctx.entrypoint}`);
          break;
        }
      }
    } catch (e) {
      console.error("Error reading Worker file:", e);
    }
  }

  if (files.includes("requirements.txt")) {
    ctx.language = "python";
    let version = "3.11";
    try {
      const data = await fsPromises.readFile(path.join(ctx.workDir, "runtime.txt"), "utf-8");
      if (data.startsWith("Python")) {
        version = data.replace("Python", "").trim();
      }
    } catch (e) { }

    ctx.runtimeVersion = version;
    ctx.baseImage = `python:${version}-slim`;
    ctx.installCmd = ['pip', 'install', '--no-cache-dir', '-r', 'requirements.txt'];

    if (!ctx.entrypoint) {
      if (files.includes("main.py")) ctx.entrypoint = "main.py";
      else if (files.includes("app.py")) ctx.entrypoint = "app.py";
      else if (files.includes("bot.py")) ctx.entrypoint = "bot.py";
      else ctx.entrypoint = "main.py"; // fallback
    }

    if (!ctx.runCmd) {
      ctx.runCmd = ["python", ctx.entrypoint];
    }
    console.log(`Detected Python ${version}`);
    return ctx;
  }

  if (files.includes("package.json")) {
    ctx.language = "node";
    let version = "18";
    try {
      const data = await fsPromises.readFile(path.join(ctx.workDir, "runtime.txt"), "utf-8");
      if (data.startsWith("v")) {
        version = data.replace("v", "").trim();
      }
    } catch (e) { }

    ctx.runtimeVersion = version;
    ctx.baseImage = `node:${version}-alpine`;
    ctx.installCmd = ['npm', 'install'];

    try {
      const pkgData = await fsPromises.readFile(path.join(ctx.workDir, "package.json"), "utf-8");
      const pkg = JSON.parse(pkgData);

      if (!ctx.entrypoint) {
        if (pkg.scripts && pkg.scripts.start && pkg.scripts.start !== "echo \"Error: no test specified\" && exit 1") {
          ctx.runCmd = ['npm', 'start'];
        } else {
          ctx.entrypoint = pkg.main || "index.js";
        }
      }
    } catch {
      if (!ctx.entrypoint) {
        ctx.entrypoint = "index.js";
      }
    }

    if (!ctx.runCmd) {
      ctx.runCmd = ["node", ctx.entrypoint];
    }

    console.log(`Detected Node ${version}`);
    return ctx;
  }

  throw new Error("No supported runtime detected! Ensure package.json or requirements.txt exists.");
}

async function orchestration(ctx) {
  const docker = new Docker();
  const containerName = ctx.containerName;
  const imageRepo = ctx.imageRepo;
  const imageTag = 'latest';
  const fullImage = ctx.fullImage;

  try {
    try {
      await docker.getContainer(containerName).remove({ force: true });
    } catch (e) { }

    try {
      await docker.getImage(ctx.baseImage).inspect();
    } catch (e) {
      console.log(`Pulling image: ${ctx.baseImage}...`);
      await new Promise((resolve, reject) => {
        docker.pull(ctx.baseImage, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    }

    console.log(`Installing dependencies using ${ctx.installCmd.join(' ')}...`);
    const buildContainer = await docker.createContainer({
      Image: ctx.baseImage,
      Cmd: ctx.installCmd,
      WorkingDir: '/app',
      HostConfig: {
        Binds: [`${ctx.workDir}:/app`]
      }
    });

    await buildContainer.start();
    const stream = await buildContainer.logs({ follow: true, stdout: true, stderr: true });
    buildContainer.modem.demuxStream(stream, process.stdout, process.stderr);

    await buildContainer.wait();
    console.log('Committing image...');
    await buildContainer.commit({
      repo: imageRepo,
      tag: imageTag
    });

    await buildContainer.remove();

    // Map custom env vars and system env vars
    const envList = [
      `PORT=3000`,
      `USER_ID=${ctx.userId}`,
      `PYTHONUNBUFFERED=1`
    ];
    for (const [key, val] of Object.entries(ctx.envVars)) {
      envList.push(`${key}=${val}`);
    }

    const appContainer = await docker.createContainer({
      Image: fullImage,
      name: containerName,
      Cmd: ctx.runCmd,
      WorkingDir: '/app',
      Env: envList,
      HostConfig: {
        Binds: [`${ctx.workDir}:/app`],
        Memory: 512 * 1024 * 1024,      // 512MB RAM
        MemorySwap: 512 * 1024 * 1024,  // No extra swap
        NanoCpus: 500000000,            // 0.5 CPU
        PidsLimit: 100,                 // Limit forks/threads
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
    });

    await appContainer.start();
    console.log('Running:', appContainer.id);

    // Stream container logs to stdout/stderr in this CLI tool so we see it run
    const appStream = await appContainer.logs({
      follow: true,
      stdout: true,
      stderr: true
    });
    appContainer.modem.demuxStream(appStream, process.stdout, process.stderr);

    return appContainer;
  } catch (err) {
    console.error('Error in orchestration:', err);
    throw err;
  }
}

async function main() {
  const ctx = new BuildContext("lakshit", "escrowbot");
  try {
    await detectRuntime(ctx);
    await orchestration(ctx);
  } catch (err) {
    console.error("Deployment failed:", err);
  }
}

main();
