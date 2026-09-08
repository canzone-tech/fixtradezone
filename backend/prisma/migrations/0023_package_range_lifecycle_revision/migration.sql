-- PKG-02 — Package investment range & lifecycle revision.
-- Forward-only. Existing package/deposit/subscription history is not rewritten.
-- New catalogue versions may define an exact investment range and duration.

ALTER TABLE `package_plan_items`
  ADD COLUMN `minimumInvestment` DECIMAL(20,8) NULL AFTER `price`,
  ADD COLUMN `maximumInvestment` DECIMAL(20,8) NULL AFTER `minimumInvestment`,
  ADD COLUMN `durationDays` INT NULL AFTER `maximumInvestment`;

ALTER TABLE `package_plan_items`
  ADD CONSTRAINT `pkg_item_min_investment_check`
    CHECK (`minimumInvestment` IS NULL OR `minimumInvestment` > 0),
  ADD CONSTRAINT `pkg_item_max_investment_check`
    CHECK (
      `maximumInvestment` IS NULL
      OR (
        `minimumInvestment` IS NOT NULL
        AND `maximumInvestment` >= `minimumInvestment`
      )
    ),
  ADD CONSTRAINT `pkg_item_duration_days_check`
    CHECK (`durationDays` IS NULL OR `durationDays` > 0),
  ADD CONSTRAINT `pkg_item_range_shape_check`
    CHECK (
      (`minimumInvestment` IS NULL AND `durationDays` IS NULL)
      OR (`minimumInvestment` IS NOT NULL AND `durationDays` IS NOT NULL)
    );

ALTER TABLE `deposits`
  ADD COLUMN `packageMinimumInvestment` DECIMAL(20,8) NULL AFTER `amount`,
  ADD COLUMN `packageMaximumInvestment` DECIMAL(20,8) NULL AFTER `packageMinimumInvestment`,
  ADD COLUMN `packageDurationDays` INT NULL AFTER `packageMaximumInvestment`,
  ADD COLUMN `packagePrincipalTreatment` VARCHAR(50) NULL AFTER `packageDurationDays`;

ALTER TABLE `deposits`
  ADD CONSTRAINT `deposit_pkg_min_investment_check`
    CHECK (`packageMinimumInvestment` IS NULL OR `packageMinimumInvestment` > 0),
  ADD CONSTRAINT `deposit_pkg_max_investment_check`
    CHECK (
      `packageMaximumInvestment` IS NULL
      OR (
        `packageMinimumInvestment` IS NOT NULL
        AND `packageMaximumInvestment` >= `packageMinimumInvestment`
      )
    ),
  ADD CONSTRAINT `deposit_pkg_duration_check`
    CHECK (`packageDurationDays` IS NULL OR `packageDurationDays` > 0);

ALTER TABLE `user_package_subscriptions`
  ADD COLUMN `minimumInvestment` DECIMAL(20,8) NULL AFTER `price`,
  ADD COLUMN `maximumInvestment` DECIMAL(20,8) NULL AFTER `minimumInvestment`,
  ADD COLUMN `durationDays` INT NULL AFTER `maximumInvestment`;

ALTER TABLE `user_package_subscriptions`
  ADD CONSTRAINT `ups_min_investment_check`
    CHECK (`minimumInvestment` IS NULL OR `minimumInvestment` > 0),
  ADD CONSTRAINT `ups_max_investment_check`
    CHECK (
      `maximumInvestment` IS NULL
      OR (
        `minimumInvestment` IS NOT NULL
        AND `maximumInvestment` >= `minimumInvestment`
      )
    ),
  ADD CONSTRAINT `ups_duration_days_check`
    CHECK (`durationDays` IS NULL OR `durationDays` > 0);
