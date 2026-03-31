export interface UserProfile {
  fullName: string;
  role: string;
  company: string;
  industry: string;
  phone: string;
  website: string;
}

export interface UserAccount {
  email: string;
  createdAt: string;
  profileCompleted: boolean;
  profile: UserProfile;
}

export interface Credentials {
  email: string;
  password: string;
}
