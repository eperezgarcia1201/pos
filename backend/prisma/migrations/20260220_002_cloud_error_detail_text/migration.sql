-- Allow full error traces for sync command failures.
ALTER TABLE `sync_commands`
  MODIFY `errorDetail` TEXT NULL;

ALTER TABLE `sync_command_logs`
  MODIFY `errorDetail` TEXT NULL;
