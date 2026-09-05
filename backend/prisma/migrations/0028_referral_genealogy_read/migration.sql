-- REF-GENEALOGY-01 — read-only administration genealogy explorer.
-- Forward-only. Referral hierarchy remains sourced from referral_profiles.sponsorUserId.
-- No financial or sponsor-assignment data is rewritten by this migration.

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'referrals.read', 'View referral genealogy and network hierarchy', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
