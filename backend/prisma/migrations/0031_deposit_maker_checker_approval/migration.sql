-- DEP-01 maker-checker approval hardening.
-- ADMIN reviews and marks a submitted deposit READY_FOR_APPROVAL.
-- SUPER_ADMIN performs the final approval. Existing terminal history remains valid.

ALTER TABLE `deposits`
  DROP CHECK `deposits_open_key_check`,
  DROP CHECK `deposits_txid_state_check`,
  DROP CHECK `deposits_review_state_check`;

ALTER TABLE `deposits`
  MODIFY `status` ENUM(
    'AWAITING_TXID',
    'PENDING_REVIEW',
    'READY_FOR_APPROVAL',
    'APPROVED',
    'REJECTED'
  ) NOT NULL DEFAULT 'AWAITING_TXID',
  ADD COLUMN `readyForApprovalByUserId` CHAR(36) NULL AFTER `submittedAt`,
  ADD COLUMN `readyForApprovalAt` DATETIME(3) NULL AFTER `readyForApprovalByUserId`,
  ADD COLUMN `readyForApprovalNote` VARCHAR(1000) NULL AFTER `readyForApprovalAt`,
  ADD INDEX `deposits_readyForApprovalByUserId_idx` (`readyForApprovalByUserId`),
  ADD CONSTRAINT `deposits_readyForApprovalByUserId_fkey`
    FOREIGN KEY (`readyForApprovalByUserId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `deposits`
  ADD CONSTRAINT `deposits_open_key_check` CHECK (
    (`status` IN ('AWAITING_TXID', 'PENDING_REVIEW', 'READY_FOR_APPROVAL') AND `openKey` IS NOT NULL)
    OR
    (`status` IN ('APPROVED', 'REJECTED') AND `openKey` IS NULL)
  ),
  ADD CONSTRAINT `deposits_txid_state_check` CHECK (
    (`status` = 'AWAITING_TXID' AND `txid` IS NULL AND `submittedAt` IS NULL)
    OR
    (`status` IN ('PENDING_REVIEW', 'READY_FOR_APPROVAL', 'APPROVED', 'REJECTED') AND `txid` IS NOT NULL AND `submittedAt` IS NOT NULL)
  ),
  ADD CONSTRAINT `deposits_ready_state_check` CHECK (
    (`status` IN ('AWAITING_TXID', 'PENDING_REVIEW')
      AND `readyForApprovalByUserId` IS NULL
      AND `readyForApprovalAt` IS NULL
      AND `readyForApprovalNote` IS NULL)
    OR
    (`status` = 'READY_FOR_APPROVAL'
      AND `readyForApprovalByUserId` IS NOT NULL
      AND `readyForApprovalAt` IS NOT NULL
      AND `readyForApprovalNote` IS NOT NULL)
    OR
    (`status` IN ('APPROVED', 'REJECTED')
      AND (
        (`readyForApprovalByUserId` IS NULL AND `readyForApprovalAt` IS NULL AND `readyForApprovalNote` IS NULL)
        OR
        (`readyForApprovalByUserId` IS NOT NULL AND `readyForApprovalAt` IS NOT NULL AND `readyForApprovalNote` IS NOT NULL)
      ))
  ),
  ADD CONSTRAINT `deposits_review_state_check` CHECK (
    (`status` IN ('AWAITING_TXID', 'PENDING_REVIEW', 'READY_FOR_APPROVAL')
      AND `reviewedAt` IS NULL
      AND `reviewNote` IS NULL)
    OR
    (`status` IN ('APPROVED', 'REJECTED')
      AND `reviewedAt` IS NOT NULL
      AND `reviewNote` IS NOT NULL)
  );
