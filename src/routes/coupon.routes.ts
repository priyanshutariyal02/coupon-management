import { Router } from "express";
import { claimCoupon } from "../controllers/coupon.controller";

const router = Router();

router.post("/claim-coupon", claimCoupon);

export default router;