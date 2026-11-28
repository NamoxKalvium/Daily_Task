import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

const { app } = createApp({
  jwtSecret: JWT_SECRET,
  jwtExpiresIn: JWT_EXPIRES_IN,
});

app.listen(PORT, () => {
  console.log(`Restaurant Reservation Auth API listening on port ${PORT}`);
});
