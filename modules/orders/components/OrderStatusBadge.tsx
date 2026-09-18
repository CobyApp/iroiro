import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL, type OrderStatus } from "../types";

const STATUS_VARIANT: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  paid: "default",
  shipped: "default",
  delivered: "outline",
  canceled: "destructive",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}
