import React, { useState } from "react"
import { ToastSave } from "./ToastSave"

export default function ToastSaveDemo() {
  const [state, setState] = useState("initial")

  const handleSave = () => {
    setState("loading")
    
    // Fake API request delay
    setTimeout(() => {
      setState("success")
      
      // Wapas initial state par layen 2 second baad
      setTimeout(() => {
        setState("initial")
      }, 2000)
    }, 1500)
  }

  const handleReset = () => {
    setState("initial")
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-muted/20 rounded-xl min-h-[200px] gap-4">
      <h3 className="text-sm text-muted-foreground mb-4">ToastSave Demo</h3>
      
      {/* Action to trigger unsaved changes */}
      {state === "initial" && (
        <p className="text-sm text-muted-foreground mb-2">
          (Click Save to see animation)
        </p>
      )}

      <ToastSave
        state={state}
        onSave={handleSave}
        onReset={handleReset}
      />
    </div>
  )
}
