DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Category" WHERE "key" = 'farm') THEN
    IF EXISTS (SELECT 1 FROM "Category" WHERE "key" = 'automation') THEN
      DELETE FROM "Category" WHERE "key" = 'farm';
    ELSE
      UPDATE "Category"
      SET "key" = 'automation', "name" = 'Automation'
      WHERE "key" = 'farm';
    END IF;
  END IF;
END $$;
