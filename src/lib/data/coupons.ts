export interface Coupon {
  code: string;
  type: "percent" | "flat";
  value: number;
  label: string;
}

export const coupons: Coupon[] = [
  { code: "T1BEMVINDO10", type: "percent", value: 10, label: "10% off no frete" },
  { code: "T1FRETE5", type: "flat", value: 5, label: "R$5,00 off no frete" },
];

export interface CouponResult {
  coupon: Coupon;
  discountBRL: number;
}

export function applyCoupon(code: string, freightPriceBRL: number): CouponResult | null {
  const normalized = code.trim().toUpperCase();
  const coupon = coupons.find((c) => c.code === normalized);
  if (!coupon) return null;

  const raw =
    coupon.type === "percent" ? (freightPriceBRL * coupon.value) / 100 : coupon.value;
  const discountBRL = Math.min(Math.max(raw, 0), freightPriceBRL);
  return { coupon, discountBRL };
}
