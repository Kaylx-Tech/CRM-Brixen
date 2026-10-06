import React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconAlertTriangle, IconLock, IconLoader2 } from "@tabler/icons-react"

export function CustomerTypeConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  customerName = "this customer",
  newType = "Individual",
  isLoading = false,
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent showCloseButton={!isLoading} className="sm:max-w-[440px] p-6">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2.5">
            <div>
              <DialogTitle className="text-base font-bold">
                Change Customer Type
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Confirm 1-time account type adjustment
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Are you sure you want to change the customer type for{" "}
            <strong className="text-foreground">{customerName}</strong> to{" "}
            <Badge variant={newType === "B2B" ? "default" : newType === "Business" ? "outline" : "secondary"} className="text-xs px-2 py-0 font-semibold">
              {newType} Account
            </Badge>
            ?
          </p>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2.5">
            <IconLock className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="font-semibold block">Permanent Lock Notice</strong>
              <p className="text-[11px] leading-normal opacity-90">
                Customer type can only be changed <strong>ONE time</strong>. Once confirmed, this field will be permanently locked and cannot be changed again.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
            className="sm:flex-1 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={isLoading}
            className="sm:flex-1 text-xs gap-1.5 font-medium"
          >
            {isLoading ? (
              <>
                <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
                Applying…
              </>
            ) : (
              <>
                <IconLock className="w-3.5 h-3.5" />
                Confirm & Lock
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CustomerTypeConfirmDialog
