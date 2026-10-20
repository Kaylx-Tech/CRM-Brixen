import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast, ToastSave } from '@/components/ui/toast'
import {
  IconCheck,
  IconAlertTriangle,
  IconAlertOctagon,
  IconInfoCircle,
  IconLoader2,
  IconDeviceFloppy,
  IconTrash,
  IconSparkles,
} from '@tabler/icons-react'

export default function ToastPlayground() {
  const [customMsg, setCustomMsg] = useState('Order GB15339 saved successfully!')
  const [showSaveToast, setShowSaveToast] = useState(false)
  const [saveToastState, setSaveToastState] = useState('initial')

  const triggerSaveFlow = () => {
    setSaveToastState('loading')
    setTimeout(() => {
      setSaveToastState('success')
      setTimeout(() => {
        setShowSaveToast(false)
        setSaveToastState('initial')
      }, 1500)
    }, 1200)
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <IconSparkles className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Toast System Test Playground</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Interactive testbench for testing spring-animated glassmorphic toasts and confirmation alerts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Standard Toast Notifications ── */}
        <Card className="rounded-2xl shadow-sm border">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Standard Notifications</CardTitle>
            <CardDescription className="text-sm">
              Click any button below to trigger the spring-animated pill toast.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                variant="outline"
                className="gap-2 text-sm justify-start border-emerald-500/20 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                onClick={() => toast.success('Order #GB15339 updated successfully!')}
              >
                <IconCheck className="w-4 h-4" />
                Success Toast
              </Button>

              <Button
                variant="outline"
                className="gap-2 text-sm justify-start border-destructive/20 hover:bg-destructive/10 text-destructive"
                onClick={() => toast.error('Failed to update company. Please try again.')}
              >
                <IconAlertOctagon className="w-4 h-4" />
                Error Toast
              </Button>

              <Button
                variant="outline"
                className="gap-2 text-sm justify-start border-amber-500/20 hover:bg-amber-500/10 text-amber-700 dark:text-amber-400"
                onClick={() => toast.warning('Accounts filing deadline is approaching (7 days left).')}
              >
                <IconAlertTriangle className="w-4 h-4" />
                Warning Toast
              </Button>

              <Button
                variant="outline"
                className="gap-2 text-sm justify-start border-primary/20 hover:bg-primary/10 text-primary"
                onClick={() => toast.info('New KYC document uploaded to company vault.')}
              >
                <IconInfoCircle className="w-4 h-4" />
                Info Toast
              </Button>

              <Button
                variant="outline"
                className="gap-2 text-sm justify-start"
                onClick={() => {
                  const id = toast.loading('Uploading company documents...')
                  setTimeout(() => {
                    // Same id → morph loading into success (no second toast)
                    toast.success('Documents uploaded & verified!', { id })
                  }, 2000)
                }}
              >
                <IconLoader2 className="w-4 h-4 animate-spin" />
                Loading &gt; Success
              </Button>

              <Button
                variant="outline"
                className="gap-2 text-sm justify-start"
                onClick={() => {
                  const id = 'playground-undo-demo'
                  toast.success('Document deleted from vault', {
                    id,
                    description: 'Invoice_GB2026.pdf · Undo available',
                    duration: 5000,
                    action: {
                      label: 'Undo',
                      onClick: () => {
                        toast.info('Delete cancelled', {
                          id,
                          description: 'File restored',
                          action: undefined,
                          duration: 2500,
                        })
                        return false
                      },
                    },
                  })
                }}
              >
                <IconTrash className="w-4 h-4" />
                Delete + Undo
              </Button>
            </div>

            <div className="pt-3 border-t space-y-2">
              <Label className="text-sm font-semibold">Custom Toast Message</Label>
              <div className="flex gap-2">
                <Input
                  value={customMsg}
                  onChange={(e) => setCustomMsg(e.target.value)}
                  className="text-sm"
                  placeholder="Type any message..."
                />
                <Button
                  size="sm"
                  className="h-8 text-sm font-semibold shrink-0"
                  onClick={() => toast.success(customMsg || 'Hello from custom toast!')}
                >
                  Send
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Unsaved Changes Confirmation Toast ── */}
        <Card className="rounded-2xl shadow-sm border">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Unsaved Changes Prompt (ToastSave)</CardTitle>
            <CardDescription className="text-sm">
              Interactive preview of the modal discard/save safety confirmation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              This toast pops up when a user modifies a form or wizard and tries to close without saving.
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                className="gap-2 text-sm"
                onClick={() => {
                  setSaveToastState('initial')
                  setShowSaveToast(true)
                }}
              >
                <IconDeviceFloppy className="w-4 h-4" />
                Show Confirmation Toast
              </Button>

              <Button
                variant="ghost"
                className="text-sm"
                onClick={() => setShowSaveToast(false)}
              >
                Hide Confirmation
              </Button>
            </div>

            <div className="rounded-xl border bg-muted/30 p-3 text-sm space-y-1">
              <div className="font-semibold text-foreground">Current State:</div>
              <div className="text-muted-foreground">
                Visible: <span className="font-mono text-primary">{showSaveToast ? 'true' : 'false'}</span> | Status:{' '}
                <span className="font-mono text-primary">{saveToastState}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Embedded Floating Confirmation Toast for testing */}
      <ToastSave
        open={showSaveToast}
        state={saveToastState}
        initialText="You have unsaved changes in this order."
        discardText="Discard"
        saveText="Save & Close"
        cancelText="Keep Editing"
        onDiscard={() => {
          setShowSaveToast(false)
          toast.info('Changes discarded.')
        }}
        onSave={triggerSaveFlow}
        onCancel={() => setShowSaveToast(false)}
      />
    </div>
  )
}
