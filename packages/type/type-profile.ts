// FIXME: cross check profile type

export interface UserProfile {
  id: string;
  profileImage: string;
  primaryRole: string;
  roles: string[];
  bio?: any;
  createdAt: string;
  updateAt?: string;
}
