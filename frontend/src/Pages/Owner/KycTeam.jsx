import { useCallback, useEffect, useState } from "react"
import { IconUserPlus } from "@tabler/icons-react"
import { cn } from "cn"
import { Table } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { ownerApi, shortDate } from "@/lib/owner"
import { Button, Panel } from "./ownerUi"
import { GREEN, GREY, PILL } from "../Kyc/kycStatus"

/** The outside KYC team: who can sign in to kyc.finstap.com. Adding someone emails them a set-password link. */
export default function KycTeam() {
  const [users, setUsers] = useState(null)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    ownerApi("/kyc-users").then((res) => res.ok && setUsers(res.data.users))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const add = async (e) => {
    e.preventDefault()
    setBusy(true)
    const id = toastProcessing("Adding…")
    const res = await ownerApi("/kyc-users", { method: "POST", body: { email, full_name: name } })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.message)
      setEmail("")
      setName("")
      load()
    } else {
      toastFail(id, res.error)
    }
  }

  const toggle = async (user) => {
    const status = user.status === "Active" ? "Disabled" : "Active"
    const res = await ownerApi(`/kyc-users/${user.id}/status`, { method: "POST", body: { status } })
    if (res.ok) {
      toastDone(undefined, res.message)
      load()
    } else {
      toastFail(undefined, res.error)
    }
  }

  return (
    <Panel
      title="KYC team"
      description="People who check the KYC orders at kyc.finstap.com. They see every workspace's ID checks (no prices) and set the status."
      className="mb-4"
    >
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="sm:w-48" aria-label="Name" />
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="sm:w-72"
          aria-label="Email"
          required
        />
        <Button type="submit" disabled={busy || !email.trim()}>
          <IconUserPlus className="size-4" /> Add and email link
        </Button>
      </form>

      {users?.length ? (
        <div className="mt-4 overflow-x-auto">
          <Table className="w-full text-left text-sm">
            <thead className="border-b text-xs font-medium text-muted-foreground">
              <tr>
                <th className="py-2.5 pr-4 font-semibold">Name</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Last sign-in</th>
                <th className="py-2.5 pl-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-4">
                    <div className="font-medium">{u.full_name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn(PILL, u.status === "Active" ? GREEN : GREY)}>
                      {u.status === "Active" ? "Active" : "Turned off"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{shortDate(u.last_login_at) || "Never"}</td>
                  <td className="py-2.5 pl-3 text-right">
                    <Button size="sm" variant={u.status === "Active" ? "ghost" : "outline"} onClick={() => toggle(u)}>
                      {u.status === "Active" ? "Turn off" : "Turn on"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        users && <p className="mt-4 text-sm text-muted-foreground">No one yet.</p>
      )}
    </Panel>
  )
}
