export interface Profile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  headline?: string;
  bio?: string;
  avatarUrl?: string;
  cvUrl?: string;
  websiteUrl?: string;
  country?: string;
  city?: string;
  phone?: string;
  searchable: boolean;
  openToWork: boolean;
  promotionYear?: number;
  specialtyCode?: string;
  specialtyName?: string;
  identityVerified?: boolean;
}

export interface Experience {
  id: string;
  title: string;
  company: string;
  location?: string;
  startDate: string;          // ISO date
  endDate?: string | null;
  description?: string;
}

export interface Achievement {
  id: string;
  title: string;
  subtitle?: string;
  period?: string;
  createdAt: string;
}

export interface SkillEndorser {
  userId: string;
  firstName: string;
  lastName: string;
}

export interface Skill {
  id: string;
  name: string;
  level: number;
  endorsementCount: number;
  endorsedByMe?: boolean;
  canEndorse?: boolean;
  endorsers?: SkillEndorser[];
}

export interface Education {
  id: string;
  degree: string;           // title
  institution: string;      // subtitle (school name)
  graduationDate: string;   // period (e.g., "2020" or "2020-2024")
  createdAt: string;
}

export interface MutualConnection {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  promotionYear?: number;
  specialtyCode?: string;
}

export interface SharedGroup {
  groupId: string;
  name: string;
  type: string;
}
