import { Router } from "express";
import { trackRedirect } from "../controllers/track.controller";

const router = Router();

router.get("/track/:linkId", trackRedirect);

export default router;