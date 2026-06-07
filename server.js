const express = require('express');
const buildpack = require('./buildpack/build');

const app = express();
app.use(express.json());

// 1. Basic Orchestration (Build & Start) dynamically based on user
app.post('/api/bots/deploy', async (req, res) => {
  const { userId, appName } = req.body;
  if (!userId || !appName) {
    return res.status(400).json({ error: "userId and appName are required" });
  }

  // Path is created dynamically: /users/{userId}/{appName}/
  const ctx = new buildpack.BuildContext(userId, appName);

  console.log(`[API] Deploying bot for ${userId}/${appName}...`);

  try {
    await buildpack.detectRuntime(ctx);
    const container = await buildpack.orchestration(ctx);
    res.json({ message: "Orchestration successful!", containerId: container.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Orchestration failed", details: err.message });
  }
});

// 2. Container Actions (Start, Stop, Restart)
app.post('/api/bots/:action', async (req, res) => {
  const { action } = req.params;
  const { containerName } = req.body;

  if (!containerName) {
    return res.status(400).json({ error: "containerName is required in the body" });
  }

  try {
    if (action === 'start') {
      await buildpack.startBot(containerName);
      res.json({ message: "Bot started successfully" });
    } else if (action === 'stop') {
      await buildpack.stopBot(containerName);
      res.json({ message: "Bot stopped successfully" });
    } else if (action === 'restart') {
      await buildpack.restartBot(containerName);
      res.json({ message: "Bot restarted successfully" });
    } else {
      res.status(400).json({ error: "Invalid action. Use 'start', 'stop', or 'restart'." });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: `Failed to ${action} bot`, details: e.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`- POST /api/bots/deploy     (Builds dynamically based on user)`);
  console.log(`- POST /api/bots/:action    (Manage existing containers)`);
});
