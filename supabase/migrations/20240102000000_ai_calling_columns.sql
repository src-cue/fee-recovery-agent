-- Add AI calling + priority columns to cases
ALTER TABLE cases ADD COLUMN IF NOT EXISTS priority_score integer DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS priority_reason text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS call_attempts integer DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_call_at timestamptz;

-- Add intent/sentiment to timeline_events
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS intent text;
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS sentiment integer;

-- Function to safely increment call_attempts
CREATE OR REPLACE FUNCTION increment_call_attempts(p_case_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE cases SET call_attempts = COALESCE(call_attempts, 0) + 1 WHERE id = p_case_id;
END;
$$ LANGUAGE plpgsql;
