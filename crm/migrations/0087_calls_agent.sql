-- The phone agent (CallRail Voice Assist, 2026-11-11, Michael: "the number ring
-- to anthony first, then the agent picks up if there's no answer"). A call the
-- agent took carries what the caller told it; functions/api/callrail.js reads
-- it from the webhook's voice_assist_message into these two columns.
--
-- agent:  1 when the agent took the call (its intake arrived), else 0.
-- intake: JSON {name, callback_phone, email, address, space, project, urgency,
--         existing} as the caller gave it, '' fields left out.
--
-- Apply: npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0087_calls_agent.sql
ALTER TABLE calls ADD COLUMN agent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calls ADD COLUMN intake TEXT;
