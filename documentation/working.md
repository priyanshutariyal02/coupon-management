# Coupon Management Core Working

## Part 1

### Schema

```prisma
model Link {
  id             String   @id
  destinationUrl String
  createdAt      DateTime @default(now())

  clicks Click[]
}

model Click {
  id        String   @id @default(uuid())
  linkId    String
  ref       String?
  ip        String
  createdAt DateTime @default(now())

  link Link @relation(fields: [linkId], references: [id])
}

```

### Route Handler

```ts
export const trackRedirect = async (req: Request, res: Response) => {
  const linkId = req.params.linkId;

  // validate input (defensive coding)
  if (typeof linkId !== "string") {
    return res.status(400).send("Invalid linkId");
  }

  let destinationUrl: string | undefined;

  try {
    // 1. try cache first (fast + no DB dependency)
    // In production, this would be Redis instead of in-memory cache
    destinationUrl = getFromCache(linkId);

    // 2. fallback to DB if not in cache
    if (!destinationUrl) {
      const link = await prisma.link.findUnique({
        where: { id: linkId },
      });

      if (link) {
        destinationUrl = link.destinationUrl;

        // store in cache for future requests
        setToCache(linkId, destinationUrl);
      }
    }

    if (!destinationUrl) {
      return res.status(404).send("Link not found");
    }

    // 3. redirect immediately (CRITICAL PATH)
    // This must not be blocked by logging or DB writes
    res.redirect(destinationUrl);

    // 4. log click asynchronously (NON-BLOCKING)
    // Even if this fails, redirect is already done
    prisma.click
      .create({
        data: {
          linkId,
          ref: typeof req.query.ref === "string" ? req.query.ref : undefined,
          ip: req.ip || "0.0.0.0",
        },
      })
      .catch(() => {
        // Fail silently logging is not critical
      });
  } catch (err) {
    // 5. fail-safe: if we already have URL, still redirect
    if (destinationUrl) {
      return res.redirect(destinationUrl);
    }

    return res.status(500).send("Redirect failed");
  }
};
```

### Testing

- Added link data:

```json
{
  "linkId": "link1",
  "destinationURL": "https://github.com/priyanshutariyal02"
}
```

- when I use this link `http://localhost:3000/track/link1?ref=instagram` in browser then i successfully redirect to `https://github.com/priyanshutariyal02`

## Part 2:

### Schema

```prisma
model Offer {
  id              String   @id @default(uuid())
  title           String
  maxCoupons      Int
  couponsClaimed  Int      @default(0)
  createdAt       DateTime @default(now())

  coupons Coupon[]
}

model Coupon {
  id         String   @id @default(uuid())
  code       String   @unique
  userId     String
  offerId    String
  isUsed     Boolean  @default(false)
  claimedAt  DateTime @default(now())

  offer Offer @relation(fields: [offerId], references: [id])

  // Prevent same user claiming same offer twice
  @@unique([userId, offerId])

  // Helps query performance
  @@index([offerId])
}
```

### Endpoint

```
http://localhost:3000/claim-coupon
```

### Route Handler

```ts
export const claimCoupon = async (req: Request, res: Response) => {
  const { userId, offerId } = req.body;

  if (!userId || !offerId) {
    return res.status(400).json({ message: "Invalid input" });
  }

  try {
    const coupon = await prisma.$transaction(async (tx) => {
      // 1. lock offer row to prevent race conditions
      const offer = await tx.$queryRawUnsafe<any>(
        `SELECT * FROM "Offer" WHERE id = $1 FOR UPDATE`,
        offerId
      );

      if (!offer || offer.length === 0) {
        throw new Error("Offer not found");
      }

      const offerData = offer[0];

      // 2. check if coupons are exhausted
      if (offerData.couponsClaimed >= offerData.maxCoupons) {
        throw new Error("Coupons exhausted");
      }

      // 3. create coupon
      // Unique constraint ensures user cannot claim twice
      const coupon = await tx.coupon.create({
        data: {
          code: randomUUID(),
          userId,
          offerId,
        },
      });

      // 4. increment claimed count
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

    return res.json(coupon);
  } catch (err: any) {
    // Handle duplicate claim (unique constraint)
    if (err.code === "P2002") {
      return res.status(400).json({ message: "Already claimed" });
    }

    return res.status(400).json({ message: err.message });
  }
};
```

### Q1: A unique constraint stops one user from claiming twice. What stops the offer limit from being breached when 50 users hit the endpoint at the same moment?

**Ans:** Row-level locking using `SELECT * FROM "Offer" WHERE id = $1 FOR UPDATE` inside a transaction ensures that only one request can read and update the offer row at a time. Other concurrent requests are blocked until the first transaction completes, so they always see the updated couponsClaimed value. This prevents overselling.

### Q2: You could handle the limit check in code or at the DB level. What did you choose and why?

**Ans:** I choose the limit at the database level inside a transaction. <br>

Reason:

- Application-level checks are not safe under concurrency
- Database transactions guarantee atomicity and consistency
- The database is the single source of truth for shared state

### Q3: If 200 users hit this at the same time and the limit is 200, walk me through what happens in your system. Is there a scenario where it goes wrong?

- If 200 users hit this at the same time and the limit is 200:
  - All requests reach the DB
  - First request locks the row
  - Others wait in queue
  - Each transaction: - checks latest couponsClaimed - increments safely
  - Result:
    - Exactly 200 coupons are issued
    - Remaining requests fail with "Coupons exhausted"
  - Is there a scenario where it goes wrong
  - In this design, it is safe under normal conditions.
- Potential edge cases:
  - If row-level locking is removed race conditions occur
  - If database isolation is misconfigured inconsistent reads possible

### Testing

- Added Data:

  ```json
  {
    "offerId": "offer1",
    "title": "50% OFF",
    "maxCoupons": 2,
    "couponsClaimed": 0
  }
  ```

- POST http://localhost:3000/claim-coupon
- Headers:
  - Content-Type: 'application/json'
- Body:
  ```json
  {
    "userId": "user1",
    "offerId": "offer1"
  }
  ```
- Response:
  ```json
  {
    "id": "13457f25-256d-4ef1-a040-a7aefe6e2f8d",
    "code": "2c30fe16-30f2-47cf-8f88-c6b42d1d7e0a",
    "userId": "user3",
    "offerId": "offer1",
    "isUsed": false,
    "claimedAt": "2026-04-05T12:59:42.341Z",
    "usedAt": null
  }
  ```

## Part 3 — Order Placement and Attribution

### Schema

```prisma
model Order {
  id          String   @id @default(uuid())
  userId      String
  offerId     String
  couponId    String
  amount      Decimal  @db.Decimal(10, 2)
  createdAt   DateTime @default(now())

  coupon Coupon @relation(fields: [couponId], references: [id])
}

model WebhookEvent {
  id             String   @id @default(uuid())
  orderId        String   @unique
  eventType      String
  idempotencyKey String   @unique
  status         String
  attempts       Int      @default(0)
  nextRetryAt    DateTime?
  lastError      String?
  deliveredAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  order Order @relation(fields: [orderId], references: [id])
}
```

### Endpoint

```
http://localhost:3000/order
```

### Route Handler

```ts
export const createOrder = async (req: Request, res: Response) => {
  const { userId, offerId, couponCode, amount } = req.body;

  if (!userId || !offerId || !couponCode || !amount) {
    return res.status(400).json({ message: "Invalid input" });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      // 1. validate coupon
      const coupon = await tx.coupon.findUnique({
        where: { code: couponCode },
      });

      if (!coupon) throw new Error("Invalid coupon");
      if (coupon.userId !== userId) throw new Error("Coupon not yours");
      if (coupon.isUsed) throw new Error("Coupon already used");

      // 2. mark coupon as used
      await tx.coupon.update({
        where: { id: coupon.id },
        data: {
          isUsed: true,
          usedAt: new Date(),
        },
      });

      // 3. create order (with attribution)
      const order = await tx.order.create({
        data: {
          userId,
          offerId,
          couponId: coupon.id,
          amount,
        },
      });

      // 4. store webhook event (OUTBOX PATTERN)
      await tx.webhookEvent.create({
        data: {
          orderId: order.id,
          eventType: "ORDER_CREATED",
          idempotencyKey: crypto.randomUUID(),
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
```

### Webhook Worker: retry and delivery

```ts
export const processWebhookEvents = async () => {
  const events = await prisma.webhookEvent.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    take: 10,
  });

  for (const event of events) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: event.orderId },
      });

      await axios.post(
        "https://analytics.partner.com/conversion",
        {
          orderId: order?.id,
          offerId: order?.offerId,
          amount: order?.amount,
        },
        {
          headers: {
            "Idempotency-Key": event.idempotencyKey,
          },
        }
      );

      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: "SUCCESS",
          deliveredAt: new Date(),
        },
      });
    } catch (err: any) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          attempts: { increment: 1 },
          nextRetryAt: new Date(Date.now() + 60000), // retry after 1 min
          lastError: err.message,
        },
      });
    }
  }
};
```

### System Handle Situations:

#### Situation 1 - Webhook timeout

- Event is already stored in WebhookEvent table.
- Worker retries automatically using status, attempts, and nextRetryAt.
- Ensures eventual delivery without blocking the main request.

#### Situation 2 - Partner missed events after 200 OK

- All events are stored persistently.
- We can replay events by resetting status to PENDING.
- This allows manual or automated recovery.

#### Situation 3 - Duplicate delivery due to retry

- Each event has a unique idempotencyKey.
- This key is sent with every webhook request.
- The partner system uses this key to ensure idempotent processing (ignore duplicates).

### Workflow Diagram

- <a href="https://drive.google.com/file/d/1ArWOBaapO4g3Nn2f_JCu5Uf6WI7OWh-w/view?usp=sharing">Click to view diagram</a>

### Testing

- POST http://localhost:3000/order
- Headers:
  - Content-Type: 'application/json'
- Body:
  ```json
  {
    "userId": "user1",
    "offerId": "offer1",
    "couponCode": "PASTE_COUPON_CODE_HERE",
    "amount": 100
  }
  ```
- Response:
  ```json
  {
    "id": "0baf8750-8bf6-43ca-b03f-7c7691cd81f4",
    "userId": "user1",
    "offerId": "offer1",
    "couponId": "13457f25-256d-4ef1-a040-a7aefe6e2f8d",
    "amount": 100,
    "createdAt": "2026-04-05T13:04:38.072Z"
  }
  ```

## Source Code

- To view fully working source code. <a href="https://github.com/priyanshutariyal02/coupon-management">Click here</a>
