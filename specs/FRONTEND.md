# Frontend Engineer Spec
**Repo:** https://github.com/src-cue/fee-recovery-agent  
**App:** `apps/web/`  
**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Recharts · React Hook Form · Zod · TanStack Table · xlsx · Papa Parse

---

## Setup

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev       # http://localhost:3000
```

Required env:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## Pages & Screens to Build

### 1. `/` — Dashboard
**Purpose:** First screen after login. Show recovery health at a glance.

**Components:**
- `KPICard` × 4: Total Active Cases · Resolved This Month · Touchless Recovery Rate · Token Balance
- `RecoveryTrendChart` (Recharts LineChart): last 30 days resolved vs escalated
- `ActiveCasesTable` (TanStack Table): top 10 most urgent cases with Days Overdue column
- `ChannelBreakdownChart` (Recharts BarChart): WA vs Call vs SMS resolve rates
- `RecentActivityFeed`: last 10 state changes across all cases

**API calls:**
```
GET /v1/dashboard/summary          → KPI numbers
GET /v1/dashboard/trend?days=30    → chart data
GET /v1/cases?status=ACTIVE&limit=10&sort=days_overdue:desc
GET /v1/dashboard/activity?limit=10
```

---

### 2. `/students` — Student & Case List
**Purpose:** Full list of all students with overdue fees. Core management screen.

**Components:**
- `CaseFilterBar`: filter by status (All / Active / Resolved / Escalated / Hold), date range, fee type, search by name/phone
- `CaseTable` (TanStack Table, server-side pagination):
  - Columns: Student Name · Parent Name · Parent Phone · Fee Type · Amount · Due Date · Days Overdue · Status · Last Action · Actions
  - Row actions: View Detail · Add Note · Put on Hold · Mark Resolved
  - Row selection checkboxes for bulk actions
- `BulkActionBar` (appears when rows selected): Bulk Hold · Bulk Export Selected · Bulk Assign Policy
- `ExportButton`: exports current filtered view to CSV or XLSX
- `BulkUploadButton`: opens upload modal

**API calls:**
```
GET /v1/cases?status=&from=&to=&fee_type=&search=&page=&limit=
POST /v1/cases/:id/note
POST /v1/cases/:id/hold
POST /v1/cases/:id/resolve
GET /v1/cases/export?format=csv&[filters]     → triggers file download
```

---

### 3. `/students/upload` — Bulk Upload
**Purpose:** Upload a CSV or Excel file of overdue students.

**Flow:**
1. User drags or selects a `.csv` or `.xlsx` file
2. Frontend parses it client-side (Papa Parse for CSV, xlsx lib for Excel) and shows a preview table
3. Column mapping step: user maps their columns to required fields (student_name, parent_phone, fee_amount, due_date, fee_type)
4. Validation: highlight rows with missing required fields or invalid phone formats
5. User clicks "Upload [N] valid rows"
6. POST to API — show progress bar if > 50 rows
7. Show result: X uploaded · Y skipped (with reason per skipped row)

**Required columns (must map):** `parent_phone`, `fee_amount`, `due_date`  
**Optional columns:** `student_name`, `parent_name`, `parent_email`, `fee_type`, `payment_link`, `notes`, `language`

**Template download:** provide a sample CSV the user can fill in

**API calls:**
```
POST /v1/cases/bulk        body: { cases: [...], dry_run: true }   ← validate only
POST /v1/cases/bulk        body: { cases: [...], dry_run: false }  ← actual upload
```

---

### 4. `/students/:id` — Case Detail
**Purpose:** Full case history, notes, current status, manual controls.

**Components:**
- `CaseHeader`: student name, parent, fee amount, status badge, days overdue
- `StatusTimeline` (vertical): each interaction as a timeline item (channel icon, timestamp, direction, intent, sentiment score)
- `NoteEditor`: rich text input (simple textarea is fine for MVP), submit adds to timeline
- `ManualControls`: buttons — Pause · Escalate to Human · Mark Paid · Override Next Action
- `ParentMemoryPanel`: preferred channel, payment history, flags (opted out, chronic late)
- `PromiseToPay` section: if PTP exists, show date + amount + countdown

**API calls:**
```
GET /v1/cases/:id
GET /v1/cases/:id/timeline
POST /v1/cases/:id/note
POST /v1/cases/:id/hold
POST /v1/cases/:id/resolve
POST /v1/cases/:id/escalate
PATCH /v1/cases/:id/override-stage   body: { stage: 'P2' }
```

---

### 5. `/templates` — Template Manager
**Purpose:** Create and manage message templates for each channel and policy stage.

**Components:**
- `TemplateList`: table of all templates with Channel · Stage · Language · Status (Approved / Pending / Draft) columns
- `TemplateEditor` (slide-over panel):
  - Template name
  - Channel: WhatsApp / SMS / Email
  - Stage: P1 / P2 / P3 / Custom
  - Language selector (en, hi, ta, te, mr, kn, bn)
  - Message body textarea with variable inserter toolbar: `{{student_name}}` `{{parent_name}}` `{{amount}}` `{{due_date}}` `{{payment_link}}` `{{school_name}}`
  - Live preview pane: shows rendered message with sample values
  - For WhatsApp: "Submit for Meta Approval" button + approval status badge
- `BuiltInTemplatesSection`: read-only display of system default templates (Day 1/5/10 for each language)

**Variables available in templates:**
```
{{student_name}}     {{parent_name}}     {{school_name}}
{{amount}}           {{currency}}        {{due_date}}
{{days_overdue}}     {{fee_type}}        {{payment_link}}
{{installment_1}}    {{installment_2}}   {{installment_3}}
```

**API calls:**
```
GET /v1/templates
POST /v1/templates
PUT /v1/templates/:id
DELETE /v1/templates/:id
POST /v1/templates/:id/submit-for-approval    ← triggers Meta submission for WA templates
GET /v1/templates/:id/preview   body: { sample_vars }
```

---

### 6. `/reminders` — Automated Reminder Settings
**Purpose:** Configure the policy ladder for this tenant.

**Components:**
- `PolicyLadderEditor`: visual timeline of stages — user can enable/disable each stage and set the day trigger
  - Stage P1: Day [N] · Channel [WA/Call/SMS] · Template [select]
  - Stage P2: Day [N] · Channel [WA/Call/SMS] · Template [select]
  - Stage P3: Day [N] · Channel [WA/Call/SMS] · Template [select]
  - Stage P4: Day [N] · Action: Human Escalation
- `ChannelPreferenceSettings`: global order for channel fallback (drag to reorder)
- `DailyCapSetting`: max messages per parent per day (default 1, range 1-3)
- `BlackoutHours`: set quiet hours (e.g. no messages 9pm–8am)
- `TestMode` toggle: sends to a test phone number instead of real parents

**API calls:**
```
GET /v1/settings/policy-ladder
PUT /v1/settings/policy-ladder
GET /v1/settings/channels
PUT /v1/settings/channels
```

---

### 7. `/settings` — Tenant Settings
**Purpose:** API keys, callback URL, integrations, billing.

**Tabs:**
- **General**: school name, timezone, currency, default language
- **API**: show API key (masked), regenerate, webhook secret, callback URL input
- **Integrations**: ERP type selector, connection status for each comm provider
- **Billing**: current plan, token balance, usage chart (last 30 days), top-up button
- **Team**: invite users, role assignment (Admin / Viewer)

**API calls:**
```
GET /v1/settings
PUT /v1/settings
GET /v1/settings/api-key        ← masked
POST /v1/settings/api-key/regenerate
GET /v1/billing/balance
GET /v1/billing/usage?period=30d
```

---

### 8. `/login` and `/onboarding` — Auth Flow
- Login via Supabase Auth (email + password, Google OAuth optional)
- Onboarding: school name → callback URL → download API key → test webhook → done

---

## Component Library

Use **shadcn/ui** for all base components (buttons, inputs, tables, dialogs, badges, tabs, toasts).  
Use **Recharts** for all charts.  
Use **TanStack Table** for all data tables (server-side sorting, filtering, pagination).

**Do not build custom components for anything shadcn already provides.**

---

## Export Implementation

```typescript
// Client-side CSV export
import Papa from 'papaparse';

export function exportToCSV(data: Case[], filename: string) {
  const csv = Papa.unparse(data.map(c => ({
    'Student Name': c.student_name,
    'Parent Phone': c.parent_phone,
    'Fee Amount': c.fee_amount,
    'Due Date': c.due_date,
    'Days Overdue': c.days_overdue,
    'Status': c.status,
    'Last Action': c.last_action_at,
  })));
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
}

// Client-side XLSX export
import * as XLSX from 'xlsx';

export function exportToXLSX(data: Case[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cases');
  XLSX.writeFile(wb, filename);
}
```

---

## Bulk Upload Implementation

```typescript
// Parse CSV client-side before sending to API
import Papa from 'papaparse';

function parseUploadFile(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data as ParsedRow[])
    });
  });
}

// Validate each row
function validateRow(row: ParsedRow, mapping: ColumnMapping): ValidationResult {
  const errors: string[] = [];
  const phone = row[mapping.parent_phone];
  if (!phone) errors.push('Missing parent phone');
  if (phone && !/^\+?[0-9]{10,13}$/.test(phone.replace(/\s/g,'')))
    errors.push('Invalid phone format');
  if (!row[mapping.fee_amount] || isNaN(Number(row[mapping.fee_amount])))
    errors.push('Invalid fee amount');
  if (!row[mapping.due_date])
    errors.push('Missing due date');
  return { valid: errors.length === 0, errors };
}
```

---

## Acceptance Criteria (Definition of Done)

- [ ] All pages render without console errors
- [ ] All API calls use proper error handling and show toast on failure
- [ ] Tables are paginated server-side (no frontend loading 1000 rows)
- [ ] Bulk upload: correctly validates and shows errors per row before submitting
- [ ] Export: CSV and XLSX both produce correct output with proper column headers
- [ ] Template preview renders variables correctly with sample data
- [ ] Policy ladder changes save and reflect immediately without page reload
- [ ] Mobile responsive (at minimum 768px breakpoint usable)
- [ ] Loading states on all async operations (skeleton or spinner)
- [ ] Empty states on all tables and lists
