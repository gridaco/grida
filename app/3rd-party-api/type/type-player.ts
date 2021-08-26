// READ ME!

/**
 * It is an interface for receiving players,
 * but now there is no player information, only a profile, so the profile is followed.
 */

export interface UserProfile {
  id: string;
  profileImage: string;
  username: string;
  roles: string[];
  bio?: any;
  createdAt: string;
  updateAt?: string;
}
