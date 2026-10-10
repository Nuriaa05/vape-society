BEGIN TRANSACTION;

-- Earlier date-only form values were encoded at 00:00 UTC instead of 00:00 Argentina.
-- Only that exact encoding changes; timestamps with other times are preserved.
UPDATE "Supplier"
SET "lastPurchase" = (
  SELECT MAX(
    CASE
      WHEN typeof("date") = 'integer' AND "date" % 86400000 = 0
        THEN "date" + 10800000
      ELSE "date"
    END
  )
  FROM "Purchase"
  WHERE "supplierId" = "Supplier"."id" AND "status" = 'Registrada'
)
WHERE EXISTS (
  SELECT 1 FROM "Purchase"
  WHERE "supplierId" = "Supplier"."id"
    AND "status" = 'Registrada'
    AND typeof("date") = 'integer'
    AND "date" % 86400000 = 0
);

UPDATE "Purchase"
SET "date" = "date" + 10800000
WHERE typeof("date") = 'integer' AND "date" % 86400000 = 0;

COMMIT;
