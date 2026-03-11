-- ============================================================
-- Render Jobs - Remotion Lambda video rendering
-- ============================================================

CREATE TABLE render_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID REFERENCES content(id) ON DELETE SET NULL,
  composition_id TEXT NOT NULL,
  input_props JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'rendering', 'completed', 'failed')),
  render_id TEXT,
  output_url TEXT,
  progress REAL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for looking up jobs by content
CREATE INDEX idx_render_jobs_content_id ON render_jobs(content_id);
-- Index for finding active renders
CREATE INDEX idx_render_jobs_status ON render_jobs(status) WHERE status IN ('pending', 'rendering');

-- Optional: link content to its latest render job
ALTER TABLE content ADD COLUMN render_job_id UUID REFERENCES render_jobs(id) ON DELETE SET NULL;

-- Enable RLS (service role bypasses)
ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;
