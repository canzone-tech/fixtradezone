import Link from "next/link";
import styles from "./platform-configuration.module.css";

type PlatformSettingsSection =
  "authentication" | "registration" | "security" | "operations" | "accounting";

interface PlatformSettingsNavProps {
  active: PlatformSettingsSection;
}

const sections: Array<{
  key: PlatformSettingsSection;
  href: string;
  label: string;
  icon: string;
}> = [
  {
    key: "authentication",
    href: "/settings/authentication",
    label: "Authentication",
    icon: "iconoir-key",
  },
  {
    key: "registration",
    href: "/settings/registration",
    label: "Registration",
    icon: "iconoir-user-plus",
  },
  {
    key: "security",
    href: "/settings/security",
    label: "Security",
    icon: "iconoir-shield-check",
  },
  {
    key: "operations",
    href: "/settings/operations",
    label: "Operations",
    icon: "iconoir-settings",
  },
];

export default function PlatformSettingsNav({
  active,
}: PlatformSettingsNavProps) {
  return (
    <nav className={styles.settingsNav} aria-label="Platform settings">
      {sections.map((section) => (
        <Link
          key={section.key}
          href={section.href}
          className={`${styles.settingsNavLink} ${
            active === section.key ? styles.settingsNavLinkActive : ""
          }`}
        >
          <i className={section.icon} />
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
