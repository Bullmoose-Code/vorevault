import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/hooks", "/files", "/p", "/api/public"];
const SESSION_COOKIE = "vv_session";

function withPathname(req: NextRequest, res: NextResponse): NextResponse {
  res.headers.set("x-vv-pathname", req.nextUrl.pathname);
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /saved → /starred (Task 13): legacy redirect, preserve subpaths and query.
  if (pathname === "/saved" || pathname.startsWith("/saved/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/saved/, "/starred");
    return NextResponse.redirect(url, 308);
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return withPathname(req, NextResponse.next());
  }
  if (req.cookies.get(SESSION_COOKIE)?.value) {
    const next = NextResponse.next();
    next.headers.set("x-vv-pathname", pathname);
    next.headers.set("x-middleware-request-x-vv-pathname", pathname);
    return next;
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
