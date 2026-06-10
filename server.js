const express = require('express');
const botRoutes = require('./routes/botRoutes');

const app = express();
app.use(express.json());

app.use('/api/bots', botRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
