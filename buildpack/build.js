require('dotenv').config({
  path: require('path').join(__dirname, '../.env')
});
const os = require("os");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const Docker = require('dockerode');
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);


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

  //checking for worker file

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

  //checking for requirements.txt file

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
      else ctx.entrypoint = "main.py";
    }

    if (!ctx.runCmd) {
      ctx.runCmd = ["python", ctx.entrypoint];
    }
    return ctx;
  }

  //checking for package.json file

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
    });

    await appContainer.start();
    console.log('Running:', appContainer.id);

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
async function startBot(containerName) {
  const docker = new Docker();
  const container = docker.getContainer(containerName);
  await container.start();
  return { success: true };
}

async function stopBot(containerName) {
  const docker = new Docker();
  const container = docker.getContainer(containerName);
  await container.stop();
  return { success: true };
}

async function restartBot(containerName) {
  const docker = new Docker();
  const container = docker.getContainer(containerName);
  await container.restart();
  return { success: true };
}

async function prepareSource(ctx, zipBuffer) {
  if (ctx.githubUrl) {
    console.log(`Cloning ${ctx.githubUrl} into ${ctx.workDir}...`);
    await fsPromises.mkdir(path.dirname(ctx.workDir), { recursive: true });
    try {
      await fsPromises.rm(ctx.workDir, { recursive: true, force: true });
    } catch (e) { }
    await execPromise(`git clone ${ctx.githubUrl} "${ctx.workDir}"`);
  } else if (zipBuffer) {
    console.log(`Extracting uploaded ZIP to ${ctx.workDir}...`);
    await fsPromises.mkdir(ctx.workDir, { recursive: true });
    try {
      await fsPromises.rm(ctx.workDir, { recursive: true, force: true });
    } catch (e) { }
    await fsPromises.mkdir(ctx.workDir, { recursive: true });
    
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(ctx.workDir, true);
    
    const extractedItems = await fsPromises.readdir(ctx.workDir);
    if (extractedItems.length === 1) {
      const nestedPath = path.join(ctx.workDir, extractedItems[0]);
      const stat = await fsPromises.stat(nestedPath);
      if (stat.isDirectory()) {
        console.log(`Detected nested folder '${extractedItems[0]}'. Unwrapping...`);
        const nestedItems = await fsPromises.readdir(nestedPath);
        for (const item of nestedItems) {
          await fsPromises.rename(path.join(nestedPath, item), path.join(ctx.workDir, item));
        }
        await fsPromises.rmdir(nestedPath);
      }
    }
  } else {
    await fsPromises.mkdir(ctx.workDir, { recursive: true });
  }
}

module.exports = {
  BuildContext,
  prepareSource,
  detectRuntime,
  orchestration,
  startBot,
  stopBot,
  restartBot
};
