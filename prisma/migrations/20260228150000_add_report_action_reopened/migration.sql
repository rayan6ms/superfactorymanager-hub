DO $$
BEGIN
  ALTER TYPE "ReportActionType" ADD VALUE 'REOPENED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
