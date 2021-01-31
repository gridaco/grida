import axios from "axios";

const GITHUB_API_URL = 'https://api.github.com';

interface GithubAuthor {
  avatar_url: string
  events_url: string
  followers_url: string
  following_url: string
  gists_url: string
  gravatar_id: string
  html_url: string
  id: number
  login: string
  node_id: string
  organizations_url: string
  received_events_url: string
  repos_url: string
  site_admin: boolean
  starred_url: string
  subscriptions_url: string
  type: string
  url: string
}

export interface GithubReleaseNote {
  assets: Array<Object>
  assets_url: string
  author: GithubAuthor
  body: string
  created_at: string
  draft: boolean
  html_url: string
  id: number
  name: string
  node_id: string
  prerelease: boolean
  published_at: string
  tag_name: string
  tarball_url: string
  target_commitish: string
  upload_url: string
  url: string
  zipball_url: string
}

export const getGithubReleaseNote = async (githubName : string, repoName : string) => {
    const { data } = await axios.get<Array<GithubReleaseNote>>(
        GITHUB_API_URL + `/repos/${githubName}/${repoName}/releases`,
      );
    
    return (data)
}