import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
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

// NFT metadata served at /nft/metadata/:tokenId (no /api prefix)
// to match the tokenURI stored on-chain: https://kiut.xyz/nft/metadata/:tokenId
app.use(nftMetadataRouter);

app.use("/api", router);

export default app;
