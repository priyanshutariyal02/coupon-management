import express from "express";
import trackRoutes from "./routes/track.routes";
import couponRoutes from "./routes/coupon.routes";
import orderRoutes from "./routes/order.routes";
const app = express();

app.use(express.json());
app.use("/", trackRoutes);
app.use("/", couponRoutes);
app.use("/", orderRoutes);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});