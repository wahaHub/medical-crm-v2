ALTER TABLE messages
  ALTER COLUMN sender_id DROP NOT NULL;

ALTER TABLE messages
  ADD COLUMN sender_role_override varchar(20),
  ADD COLUMN sender_name_override varchar(255);
