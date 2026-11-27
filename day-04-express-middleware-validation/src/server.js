import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 3000);
const { app } = createApp();

app.listen(PORT, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'server_started',
    port: PORT,
  }));
});
