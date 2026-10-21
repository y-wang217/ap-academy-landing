# Every instrument has four states

| Component | Loaded | Empty | Loading | Error / stale |
|---|---|---|---|---|
| North star | value and countable source records | "No verified change this week" only if sources complete | skeleton, not zero | "Cannot verify weekly hours" + source + retry |
| Lead radar | stage totals + text table | "No active leads" only if live complete | subdued ring | "Lead CRM unavailable; last checked …" |
| Rolodex | next eligible person and due action | "Queue clear" ONLY after all pages fetched | retained last confirmed context with busy label | block risky edits; open canonical CRM link |
| Teacher load | confirmed availability and assigned blocks | "No teachers active" only if source confirms | previous snapshot with fetching | never show 0% capacity if unknown |
| Cashflow | collected verified transaction total | zero only from complete ledger | neutral placeholder | "Payment records unavailable" |
| Follow-ups | due/overdue unresolved cases | "Nothing due" if sync complete | placeholder | "May be incomplete" + retry |
| Creation | existing tasks with owner and links | "No tasks scheduled" if task source complete | skeleton | deep-link canonical Notion Work and explain failure |
| Signals | actionable, source-linked exceptions | "No exceptions found" if checks are complete | "Checking sources…" | show failed checks, don't greenwash |

Global state: offline badge; last successful fetch per panel; independent retry; helpful error messages. No demo data fallback in production. Never show fictional system status such as "all systems operational" by default.
