const buildpack = require('../buildpack/build');

exports.deploy = async (req, res) => {
  const { userId, appName } = req.body;
  if (!userId || !appName) {
    return res.status(400).json({ error: "userId and appName are required" });
  }

  const ctx = new buildpack.BuildContext(userId, appName);

  try {
    await buildpack.detectRuntime(ctx);
    const container = await buildpack.orchestration(ctx);
    res.json({ message: "Deployment successful!", containerId: container.id });
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
};
