import { buildServer } from "./server.js";

const port = Number(process.env.PORT || 8080);
const host = "0.0.0.0";

const start = async () => {
  const app = await buildServer();
  try {
    await app.listen({ port, host });
    app.log.info(`api listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
