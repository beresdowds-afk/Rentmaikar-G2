import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { healthRouter } from "./routes/health";
import { cpaasRouter } from "./routes/cpaas";
import { webhooksRouter } from "./routes/webhooks";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/** Canonical public backend base URL (API host). */
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || "https://staging.rentmaikar.com";

/** Production frontend origins allowed to call this API. */
const DEFAULT_ALLOWED_ORIGINS = [
  "https://rentmaikar.com",
  "https://www.rentmaikar.com",
];

// Security and middleware configuration
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

// API Route Registration
// Webhooks need the raw body to verify signatures, so mount before express.json()
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhooksRouter);
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/cpaas", cpaasRouter);

// Global 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.originalUrl} does not exist on Rentmaikar API Gateway`,
  });
});

// Server boot
app.listen(PORT, () => {
  console.log(`🚀 Rentmaikar Backend API Gateway running on port ${PORT}`);
  console.log(`🌐 Public backend URL: ${PUBLIC_BACKEND_URL}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
});
