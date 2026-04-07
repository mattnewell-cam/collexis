### Questions
- When user manually adds communication, if they don't structure "Details" strictly, does anything break? 

## Workflow
1. User adds job files (invoice, whatsapp ss, emails...)
2. GPT processes into details and a timeline. User reviews, adds any other details, instructions, communications.
3. TODO: A chatbot extracts some extra context (optional skip) such as relationship, tone, vulnerabilities
3. User sets "friendly days" until proper handover (minimum 3wd to avoid nasty surprises), hits generate plan. 
4. 5.4-thinking creates the basic comms skeleton, 5.4-mini fills in the actual emails/msgs/voicemails to send. 
5. Friendly communications go out.
   - Initial ones are just "oh hey can u pay"
   - Later ones are "we will have to hand this off to our debt collection team"
   - Depending on response, we may ask user what to do, or negotiate, or move to (6), or move to (7)
   - If no response, go to (6)
6. "Handover" to Collexis. Generate new plan, w/ more aggressive language + legal threats
   - User cannot see details of communications - we fully own them now.
   - Again, depending on response, we may ask user what to do, or negotiate, or move to (6), or move to (7)
   - TODO: add skip-tracing item partway through
   - TODO £20 surcharge
   - TODO Demand payment to us not user; automatically detect payment and cease plan.
   - If no response, go to (y)
7. Legal stage. File a Letter of Action. Wait 30d. File a small claim. If they defend it, hand back to user.

### UI
- Job detail sub-routes now share cached job/documents/communications/outreach-plan state under the `[id]` layout, so switching tabs no longer cold-loads those panels every time.
- Uploading documents from an existing job now refreshes the job intake summary too, so the Details tab picks up newly extracted job detail, internal notes, and contact info instead of only adding a new document card.
- Existing-job follow-up uploads now review the new documents against the current saved details/context/contact fields instead of regenerating and appending a fresh summary blob.
- Manual timeline entries now use a stripped-back medium/date/details form, generate their short description with `gpt-5.4-nano`, and no longer expose Collexis-owned or system communication types for manual edit/delete.

### Runtime
- Local generated artifacts now consolidate under `runtime/`, including backend SQLite/uploads defaults, sandbox backend data dirs, Next build output, pytest cache, tsbuildinfo, the build/start runtime venv, and the Playwright WhatsApp profile path.
- `npm run dev` now boots the Python backend alongside Next, so the local documents/timeline features come up on ports `8000` and `3000` together by default.
- Production log persistence now tolerates `proxy` and `server-component` sources against the legacy `app_logs` schema, and the start script binds Next to `0.0.0.0` for Render more explicitly.
- WhatsApp sending now reuses a populated legacy root `.playwright-profile` automatically if present, so older authenticated Playwright sessions still work after the runtime cleanup.
- Starter/sample jobs now lazily backfill their missing communications timeline into Supabase when the communications page opens, so seeded accounts no longer show empty sample timelines.
- Optional bug triage now watches persistent `app_logs`, groups distinct failures into `bug_incidents`, asks OpenAI whether each looks like a real bug or a transient issue, and now ships with a Codex handoff runner that can push a fix branch and open a draft PR.
- The Windows bug-autofix runner now launches Codex through `cmd /c` when the CLI comes from the Windows Store alias, avoiding the `WinError 5` startup failure before Codex can even assess the incident.
- Bug triage no longer crashes on incident sample fields that contain list values, so the live watcher can keep classifying incidents instead of dying with `unhashable type: 'list'`.

### Comms channels
- Intend to eventually have email, call, SMS, whatsapp and letters
  - Email: working, but breaks on Pembroke wifi. **If not working, switch to hotspot.**
  - WhatsApp send execution now runs through the Python backend; the Next route just authenticates, forwards, and audits so Playwright stays out of the Next build.
  - WhatsApp: being fucking retarded so not yet working. Probably need to just buy a mobile number tbh. So again waiting on Telnyx
  - SMS: not yet working as Telnyx info under review
  - Calls: needs Telnyx and a bunch more wiring for voice AI
  - Letters: handle later
