-- Case Lifecycle: fold existing cases into the Lifecycle board.
-- All legacy rows had treatment_stage = NULL (creation hard-coded null);
-- backfill them to the new initial stage INTAKE (added in 049).
UPDATE cases SET treatment_stage = 'INTAKE' WHERE treatment_stage IS NULL;
