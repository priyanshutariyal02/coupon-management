/**
 * In production, replace in-memory cache with Redis
 * to ensure consistency across multiple instances
 */

import { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { getFromCache, setToCache } from "../utils/cache";

export const trackRedirect = async (req: Request, res: Response) => {
  const linkId = req.params.linkId;

  if (typeof linkId !== "string") {
    return res.status(400).send("Invalid linkId");
  }

  let destinationUrl: string | undefined;

  try {
    // 1. try cache
    destinationUrl = getFromCache(linkId);

    // 2. fallback to DB
    if (!destinationUrl) {
      const link = await prisma.link.findUnique({
        where: { id: linkId },
      });

      if (link) {
        destinationUrl = link.destinationUrl;

        // cache it for next time
        setToCache(linkId, destinationUrl);
      }
    }

    if (!destinationUrl) {
      return res.status(404).send("Link not found");
    }

    // 3. redirect immediately (critical path)
    res.redirect(destinationUrl);

    // 4. async logging (non-blocking)
    prisma.click
      .create({
        data: {
          linkId,
          ref: typeof req.query.ref === "string" ? req.query.ref : undefined,
          ip: req.ip || "0.0.0.0",
        },
      })
      .catch(() => {});
  } catch (err) {
    // 5. FAIL-SAFE: if cache had value, still redirect
    if (destinationUrl) {
      return res.redirect(destinationUrl);
    }

    return res.status(500).send("Redirect failed");
  }
};
