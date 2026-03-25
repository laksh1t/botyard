require('dotenv').config({
    path: require('path').join(__dirname, '../.env')
});
const os = require("os");
const fs = require("fs");
const path = require("path");
const Docker = require('dockerode');


const workDir = process.env.WORK_DIR;

class ctx{

    constructor(){

    this.userId;
    this.image;
    this.entrypoint;
    }
}

function detectRuntime(workDir){
    fs.readdir(workDir,(err,files)=>{
        if(err){
            console.log(err);
            return;
        }
        if(!files.includes("requirements.txt")){
            console.log("requirements.txt not found");
            return;
        }
        if(!files.includes("runtime.txt")){
            console.log("runtime.txt not found");
            return;
        }
    })
    fs.readFile(path.join(workDir,"runtime.txt"),"utf-8",(err,data)=>{
        if(err){
            console.log(err);
            return;
        }
        if(data.startsWith("Python")){
            try{
                const version = data.replace("Python ","")
                console.log("python:"+version);
            } catch(err){
            //pass
            }
        } else if(data.startsWith("v")){
            try{
                const version = data.replace("v","")
                console.log("node:"+version);
            } catch(err){
            //pass
            }
        } else{
            console.log("Runtime not Detected");
        }
    })
    fs.readFile(path.join(workDir,"Worker"),'utf-8',(err,data)=>{
        if(err){
            console.log(err);
            return;
        }
        console.log(data);
    })
}

function createDockerfile(runtime,entrypoint){
    const txt = `
FROM ${runtime}

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "${entrypoint}"]
    
    `;

    fs.writeFile(path.join(workDir,"Dockerfile"),txt.trim(),'utf-8',(err)=>{
        if(err){
            console.log(err);
            return;
        }
    })
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
    } catch (e) {}

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
        Binds: [`${workDir}:/app`]
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
        Binds: [`${workDir}:/app`],

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

//detectRuntime(workDir);
//createDockerfile("python:3.12.0","main.py");
ctx.image="python:3.11-slim";
ctx.entrypoint="main.py";
ctx.userId="lakshit-escrowbot";
orchestration(ctx);

