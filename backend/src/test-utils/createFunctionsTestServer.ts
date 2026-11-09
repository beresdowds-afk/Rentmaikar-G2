import express, { type Router } from "express";
import type { Server } from "node:http";

export function createFunctionsTestServer(router: Router): Server {
  const app = express();
  app.use(express.json());
  app.use("/api/functions", router);
  return app.listen(0);
}
