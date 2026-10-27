import { useEffect, useState } from "react"
import { IconCheck, IconMinus } from "@tabler/icons-react"
import { money } from "@/lib/owner"
import { getApiBase } from "@/lib/api"
import { LoadError, PageTitle, Panel } from "./ownerUi"

/** Prices, limits and features of every plan, as the landing page and the limits use them. */
export default function OwnerPlans() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    // The public list is the same one the landing page shows
    fetch(`${getApiBase()}/platform/plans`)
      .then((r) => r.json())
      .then((json) => (json.success ? setData(json.data) : setError(json.error || "Could not load plans")))
      .catch(() => setError("Cannot reach the server."))
  }, [])

  if (error) return <LoadError error={error} />
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  const plans = data.order.map((key) => data.plans[key])
  const limit = (value, key) =>
    value === null || value === undefined ? "Unlimited" : key === "storage_gb" ? `${value} GB` : value.toLocaleString("en-GB")

  return (
    <>
      <PageTitle
        title="Plans"
        description={`New workspaces start on a free trial with the ${data.plans[data.trial_plan].name} plan. Prices and limits live in backend/services/plans.py.`}
      />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 pr-4 font-semibold text-muted-foreground" />
                {plans.map((p) => (
                  <th key={p.key} className="px-4 py-3">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {p.custom ? "Custom quote" : `${money(p.price_month)}/mo · ${money(p.price_year)}/yr`}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.limits).map(([key, label]) => (
                <tr key={key} className="border-b">
                  <td className="py-2.5 pr-4 text-muted-foreground">{label}</td>
                  {plans.map((p) => (
                    <td key={p.key} className="px-4 py-2.5 tabular-nums font-medium">
                      {limit(p.limits[key], key)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-b">
                <td className="py-2.5 pr-4 text-muted-foreground">Extra user</td>
                {plans.map((p) => (
                  <td key={p.key} className="px-4 py-2.5">
                    {p.extra_user_month ? `${money(p.extra_user_month)}/mo` : "Included"}
                  </td>
                ))}
              </tr>
              {Object.entries(data.features).map(([key, label]) => (
                <tr key={key} className="border-b last:border-0">
                  <td className="py-2.5 pr-4 text-muted-foreground">{label}</td>
                  {plans.map((p) => (
                    <td key={p.key} className="px-4 py-2.5">
                      {p.features.includes(key) ? (
                        <IconCheck className="size-4 text-emerald-600" />
                      ) : (
                        <IconMinus className="size-4 text-muted-foreground/40" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
