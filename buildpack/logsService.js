const { spawnSync } = require('child_process');

function getBotLogs(containerName) {
  try {
    const res = spawnSync('docker', ['logs', '--timestamps', '--tail', '100', containerName]);
    const stdoutLines = res.stdout ? res.stdout.toString('utf-8').split('\n').filter(line => line.trim().length > 0) : [];
    const stderrLines = res.stderr ? res.stderr.toString('utf-8').split('\n').filter(line => line.trim().length > 0) : [];

    const parsedLogs = [];
    for (const line of stdoutLines) {
      parsedLogs.push({ stream: 'STDOUT', line });
    }
    for (const line of stderrLines) {
      parsedLogs.push({ stream: 'STDERR', line });
    }

    parsedLogs.sort((a, b) => {
      const tsA = a.line.split(' ')[0] || '';
      const tsB = b.line.split(' ')[0] || '';
      return tsA.localeCompare(tsB);
    });

    return parsedLogs;
  } catch (e) {
    console.error("Error fetching logs via spawnSync:", e);
    return [];
  }
}

module.exports = {
  getBotLogs
};
