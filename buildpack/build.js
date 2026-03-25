const os = require("os");
require('dotenv').config();
const fs = require("fs");
const path = require("path");

const workDir = process.env.workDir;

class ctx{

    constructor(){

    this.runtime;
    this.version;
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
            console.log("requiremnets.txt not found");
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

function orchestration(){

}

//detectRuntime(workDir);
createDockerfile("python:3.12.0","main.py");

