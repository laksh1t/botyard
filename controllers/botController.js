const buildpack = require('../buildpack/build');
const pool = require('../db');

exports.deploy = async (req, res) => {
  const { userId, appName, githubUrl } = req.body;
  let envVars = req.body.envVars || {};

  if (typeof envVars === 'string') {
    try {
      envVars = JSON.parse(envVars);
    } catch (e) {
      envVars = {};
    }
  }

  if (!userId || !appName) {
    return res.status(400).json({ error: "userId and appName are required" });
  }

  const ctx = new buildpack.BuildContext(userId, appName, githubUrl, envVars);
  const zipPath = req.file ? req.file.path : null;

  try {
    await buildpack.prepareSource(ctx, zipPath);

    if (zipPath) {
      const fsPromises = require('fs').promises;
      try {
        await fsPromises.unlink(zipPath);
      } catch (e) {
        console.error("Failed to delete temp zip file:", e);
      }
    }

    await buildpack.detectRuntime(ctx);

    const container = await buildpack.orchestration(ctx);

    const insertResult = await pool.query(
      "INSERT INTO bots (user_id, name, container_id, runtime, github_url, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [userId, appName, container.id, ctx.runtime, githubUrl || null, 'running']
    );

    res.json({ message: "Deployment successful!", bot: insertResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Deployment failed", details: err.message });
  }
};

exports.action = async (req, res) => {
  const { action } = req.params;
  const { containerName } = req.body;

  if (!containerName) {
    return res.status(400).json({ error: "containerName is required in the body" });
  }

  try {
    if (action === 'start') {
      await buildpack.startBot(containerName);
      await pool.query("UPDATE bots SET status = 'running' WHERE container_id = $1", [containerName]);
      res.json({ message: "Bot started successfully" });
    } else if (action === 'stop') {
      await buildpack.stopBot(containerName);
      await pool.query("UPDATE bots SET status = 'stopped' WHERE container_id = $1", [containerName]);
      res.json({ message: "Bot stopped successfully" });
    } else if (action === 'restart') {
      await buildpack.restartBot(containerName);
      await pool.query("UPDATE bots SET status = 'running', deploys = deploys + 1, last_deployed_at = NOW() WHERE container_id = $1", [containerName]);
      res.json({ message: "Bot restarted successfully" });
    } else {
      res.status(400).json({ error: "Invalid action. Use 'start', 'stop', or 'restart'." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: `Failed to ${action} bot`, details: e.message });
  }
};

exports.getBots = async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "userId query parameter is required" });
  }

  try {
    const result = await pool.query("SELECT * FROM bots WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
    res.json({ bots: result.rows });
  } catch (e) {
    console.error("Failed to fetch bots:", e);
    res.status(500).json({ error: "Failed to fetch bots", details: e.message });
  }
};
