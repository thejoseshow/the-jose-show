-- Enable auto-approve and auto-schedule so the pipeline posts automatically
UPDATE app_settings SET value = 'true', updated_at = now() WHERE key = 'auto_approve_pipeline';
UPDATE app_settings SET value = 'true', updated_at = now() WHERE key = 'auto_schedule_enabled';
