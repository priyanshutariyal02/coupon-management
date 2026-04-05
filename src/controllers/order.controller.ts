import { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { randomUUID } from "crypto";

export const createOrder = async (req: Request, res: Response) => {
  const { userId, offerId, couponCode, amount } = req.body;

  if (!userId || !offerId || !couponCode || !amount) {
    return res.status(400).json({ message: "Invalid input" });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      // 1. get coupon
      const coupon = await tx.coupon.findUnique({
        where: { code: couponCode },
      });

      if (!coupon) throw new Error("Invalid coupon");
      if (coupon.userId !== userId) throw new Error("Coupon not yours");
      if (coupon.isUsed) throw new Error("Coupon already used");

      // 2. mark as used
      await tx.coupon.update({
        where: { id: coupon.id },
        data: {
          isUsed: true,
          usedAt: new Date(),
        },
      });

      // 3. create order
      const order = await tx.order.create({
        data: {
          userId,
          offerId,
          couponId: coupon.id,
          amount,
        },
      });

      // 4. create webhook event
      await tx.webhookEvent.create({
        data: {
          orderId: order.id,
          eventType: "ORDER_CREATED",
          idempotencyKey: randomUUID(),
          status: "PENDING",
        },
      });

      return order;
    });

    return res.json(order);

  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};