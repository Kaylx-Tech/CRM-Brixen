import { useSearchParams } from 'react-router-dom'
import { cn } from 'cn'
import Tasks from '@/Pages/Tasks/Tasks'
import GovForms from '@/Pages/GovForms/GovForms'

const SECTIONS = [
  ['checks', 'Checks'],
  ['forms', 'Gov Forms'],
]

/**
 * Smart Operations › UK Gov Checks: the team's checks (tasks) and, beside them, Gov Forms (Companies House forms
 * filled in from Companies House and the CRM). ?section=forms opens the forms; their own company / form / filing
 * choices sit in the same address.
 */
export default function UkGovChecks() {
  const [params, setParams] = useSearchParams()
  const section = params.get('section') === 'forms' ? 'forms' : 'checks'
  const setSection = (value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'forms') next.set('section', 'forms')
        else ['section', 'company', 'form', 'filing'].forEach((key) => next.delete(key))
        return next
      },
      { replace: true },
    )
  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-fit gap-1 rounded-full border bg-muted/50 p-1">
        {SECTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSection(value)}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium transition-colors',
              section === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {section === 'forms' ? <GovForms embedded /> : <Tasks view="uk-gov-checks" />}
    </div>
  )
}
