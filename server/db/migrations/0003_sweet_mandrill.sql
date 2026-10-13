ALTER TABLE `tokens` ADD `first_used_at` integer;--> statement-breakpoint
-- First-use tokens already opened only kept the expiry their first view set, so
-- the moment of that view is reconstructed from it. Earlier tokens of any other
-- kind have no record of their first use and are left empty.
UPDATE `tokens` SET `first_used_at` = CAST(strftime('%s', `expires_at`, 'unixepoch', '-' || COALESCE(
  json_extract(`valid_for`, '$.hours') || ' hours',
  json_extract(`valid_for`, '$.days') || ' days',
  (json_extract(`valid_for`, '$.weeks') * 7) || ' days',
  json_extract(`valid_for`, '$.months') || ' months'
)) AS integer)
WHERE `valid_for` IS NOT NULL AND `expires_at` IS NOT NULL;
