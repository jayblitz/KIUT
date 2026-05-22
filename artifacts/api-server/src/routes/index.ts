import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import verifyRouter from "./verify";
import nftRouter from "./nft";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(verifyRouter);
router.use(nftRouter);

export default router;
