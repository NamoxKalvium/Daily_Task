import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 3002);
const { app } = createApp();

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Personal Finance REST API listening on http://127.0.0.1:${PORT}`);
});
