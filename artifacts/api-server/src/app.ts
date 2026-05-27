import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import nftMetadataRouter from "./routes/nft-metadata";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isDevelopment = process.env.NODE_ENV === "development";

// Rate limit the public nonce-issuance endpoint before mounting the main router.
// This endpoint accepts unauthenticated requests and inserts a DB row for every
// call. Without throttling a caller can flood the database with nonce rows at
// negligible cost. 10 requests per 15-minute window per IP is generous for
// legitimate users while making bulk-insert abuse impractical.
// In development the limit is raised to 200 to avoid blocking rapid test cycles.
const signMessageRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 200 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "rate_limited",
    message: "Too many sign-message requests from this IP. Please try again later.",
  },
});

app.use("/api/verify/sign-message", signMessageRateLimit);

// Rate limit the public mint-authorization endpoint. It is unauthenticated and
// inserts DB rows + performs on-chain reads and signing on every call. Without
// throttling, a single caller can exhaust storage and backend resources at
// negligible cost. 5 requests per 15-minute window per IP is sufficient for
// legitimate users while making bulk-abuse impractical.
// In development the limit is raised to 100 to avoid blocking repeated test mints.
const mintRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 100 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "rate_limited",
    message: "Too many mint requests from this IP. Please try again later.",
  },
});

app.use("/api/nft/mint", mintRateLimit);

// NFT metadata served at /nft/metadata/:tokenId (no /api prefix)
// to match the tokenURI stored on-chain: https://kiut.xyz/nft/metadata/:tokenId
app.use(nftMetadataRouter);

app.use("/api", router);

export default app;
