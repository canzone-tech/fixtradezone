export interface GenealogyNode {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  referralCode: string;
  assignmentStatus: string;
  sponsorUserId: string | null;
  assignedAt: string | null;
  referralJoinedAt: string;
  accountCreatedAt: string;
  directReferralCount: number;
  hasChildren: boolean;
  activePackageCount: number;
  hasActivePackage: boolean;
}

export interface GenealogyPage {
  rootUserId: string;
  level: number;
  parent: GenealogyNode;
  children: GenealogyNode[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface GenealogySearchItem {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  referralCode: string;
  assignmentStatus: string;
  sponsorUserId: string | null;
  directReferralCount: number;
  activePackageCount: number;
}

export interface GenealogySearchResponse {
  items: GenealogySearchItem[];
}

export function genealogyDisplayName(node: {
  username: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    [node.firstName, node.lastName].filter(Boolean).join(" ").trim() ||
    node.username
  );
}
