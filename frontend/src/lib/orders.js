/**
 * Cancelling an order in one step: the order is marked Cancelled and the server cancels its invoice
 * with it (sync_invoice_with_order). An invoice that is already paid stays paid, so the money that
 * came in is not lost; it is refunded from Finance if needed.
 */
import { apiRequest } from "@/lib/api"
import { toastProcessing, toastDone, toastFail } from "@/lib/toastActions"

const CLOSED = ["Cancelled", "Refunded"]

/** Whether the order can still be cancelled. */
export function canCancelOrder(order) {
  return Boolean(order) && !CLOSED.includes(String(order.status || ""))
}

/** What the confirm popup says before cancelling. */
export function cancelOrderMessage(order) {
  const number = order?.order_number || order?.id || ""
  return `Order ${number} will be marked Cancelled and its invoice will be cancelled too. ` +
    "An invoice that is already paid stays paid (refund it from Finance if needed)."
}

/** Cancel the order and its invoice; resolves to true when it worked. */
export async function cancelOrder(order) {
  const toastId = toastProcessing("Cancelling order and invoice…")
  const res = await apiRequest(`/orders/${order.id}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "Cancelled" }),
    label: "Cancel order",
    silent: true,
  })
  if (res.ok) {
    toastDone(toastId, `Order ${order.order_number || order.id} and its invoice cancelled`)
    return true
  }
  toastFail(toastId, res.reason || "The order could not be cancelled")
  return false
}
