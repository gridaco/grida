import cookie from "cookie"
import { NextPageContext } from "next"

export function parseCookies({ req } : NextPageContext) {
  return cookie.parse(req ? req.headers.cookie || "" : document.cookie)
}