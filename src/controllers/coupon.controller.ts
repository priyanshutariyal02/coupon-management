/**
 * Row-level locking ensures only one transaction modifies offer at a time
 * preventing overselling under high concurrency
 */

import { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { randomUUID } from "crypto";

export const claimCoupon = async (req: Request, res: Response) => {
  const { userId, offerId } = req.body;

  if (!userId || !offerId) {
    return res.status(400).json({ message: "Invalid input" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. lock the offer row
      const offer = await tx.$queryRawUnsafe<any>(
        `SELECT * FROM "Offer" WHERE id = $1 FOR UPDATE`,
        offerId
      );

      if (!offer || offer.length === 0) {
        throw new Error("Offer not found");
      }

      const offerData = offer[0];

      // 2. check limit
      if (offerData.couponsClaimed >= offerData.maxCoupons) {
        throw new Error("Coupons exhausted");
      }

      // 3. try create coupon (unique constraint handles duplicates)
      const coupon = await tx.coupon.create({
        data: {
          code: randomUUID(),
          userId,
          offerId,
        },
      });

      // 4. increment counter
      await tx.offer.update({
        where: { id: offerId },
        data: {
          couponsClaimed: {
            increment: 1,
          },
        },
      });

      return coupon;
    });

    return res.json(result);
  } catch (err: any) {
    // handle unique constraint (user already claimed)
    if (err.code === "P2002") {
      return res.status(400).json({ message: "Already claimed" });
    }

    return res.status(400).json({ message: err.message });
  }
};