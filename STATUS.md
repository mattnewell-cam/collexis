
## Workflow
1. User adds job files (invoice, whatsapp ss, emails...)
2. GPT processes into details and a timeline. User reviews, adds any other details, instructions, communications.
3. User sets days until full Collexis handover, hits generate plan. 
4. 5.4-thinking creates the basic comms skeleton, 5.4-mini fills in the actual emails/msgs/voicemails to send. 
   - TODO: add skip-tracing item partway through
5. Communications go out. 
   - TODO: If at any point the debtor responds positively, reassess and potentially end communications / ask the user
   - TODO: If the debtor responds negatively, accelerate straight to (6)
6. If no response (or negative), "handover". A new plan is generated, with more aggressive language & legal threats. 
   - User cannot see details.
   - Invoices (can?) now demand payment to us.
7. If still nothing, we enter legal stage. File a Letter of Action. Wait 30d. File a CCJ. (Both with Garfield).

### UI


### Runtime
- Local generated artifacts now consolidate under `runtime/`, including backend SQLite/uploads defaults, sandbox backend data dirs, Next build output, pytest cache, tsbuildinfo, the build/start runtime venv, and the Playwright WhatsApp profile path.

### Comms channels
- Intend to eventually have email, call, SMS, whatsapp and letters
  - Email: working, but breaks on Pembroke wifi. **If not working, switch to hotspot.**
  - WhatsApp: being fucking retarded so not yet working. Probably need to just buy a mobile number tbh. So again waiting on Telnyx
  - SMS: not yet working as Telnyx info under review
  - Calls: needs Telnyx and a bunch more wiring for voice AI
  - Letters: handle later
