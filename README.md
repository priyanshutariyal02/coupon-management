# Coupon Management Backend (Prisma + PostgreSQL)

A backend service built using **Node.js**, **Prisma ORM**, and **PostgreSQL (Neon)**.
It handles offers, coupons, orders, and webhook events.

---

## Features

- Coupon & Offer management
- Order creation with relations
- Webhook event handling (idempotency supported)
- Prisma migrations & schema management

---

## Tech Stack

- Node.js
- Prisma ORM
- PostgreSQL (Neon DB)

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/priyanshutariyal02/coupon-management.git
cd coupon-management
```

### 2. Install dependencies

```bash
npm install
```

### 3. Setup environment variables

Create a `.env` file:

```env
DATABASE_URL="your_neon_database_url"
```

---

## Database Setup

Run migrations:

```bash
npx prisma migrate dev
```

If facing migration drift (dev only):

```bash
npx prisma migrate reset
```

---

## ▶Run Project

```bash
npm run dev
```

---

## Prisma Commands

Generate client:

```bash
npx prisma generate
```

View DB:

```bash
npx prisma studio
```

## Core Working

- <a href="./documentation/working.md">Click to check doument</a>
