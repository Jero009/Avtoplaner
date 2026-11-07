-- Autoplaner schema v2
-- lessons.note: change note for a lesson row (e.g. the ORIGINAL subject of
-- a substitution or cancellation). Used to attribute split-group slots to
-- the group that owns the hour — see integrations/easistent/group-choice.ts.

ALTER TABLE lessons ADD COLUMN note TEXT;
