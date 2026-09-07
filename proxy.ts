import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// One shared password for Shravan and Deepk. Not user accounts, and not meant to be.
const COOKIE_NAME = 'swpm_auth';
const LOGIN_PATH = '/login';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// HeyGen calls this from outside and has no cookie.
const PUBLIC_PATHS = ['/api/webhooks/heygen'];

/** The cookie holds a hash, so the password itself is never stored in the browser. */
async function token(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function loginPage(next: string, failed: boolean) {
  const body = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Shorts Generator</title></head>
  <body style="font-family: system-ui; max-width: 24rem; margin: 4rem auto">
    <h1>Shorts Generator</h1>
    <form method="post" action="${LOGIN_PATH}">
      <input type="hidden" name="next" value="${next.replace(/"/g, '&quot;')}" />
      <input type="password" name="password" autofocus placeholder="Password" style="width: 100%; padding: .5rem" />
      <button type="submit" style="margin-top: .5rem; padding: .5rem">Enter</button>
      ${failed ? '<p style="color: #b00">Wrong password.</p>' : ''}
    </form>
  </body>
</html>`;

  return new NextResponse(body, {
    status: failed ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const password = process.env.APP_PASSWORD;
  if (!password) {
    // Failing closed: an unset password must not mean an open site.
    return new NextResponse('APP_PASSWORD is not set', { status: 500 });
  }

  const expected = await token(password);

  if (pathname === LOGIN_PATH && request.method === 'POST') {
    const form = await request.formData();
    const submitted = String(form.get('password') ?? '');
    const next = String(form.get('next') || '/');

    if ((await token(submitted)) !== expected) return loginPage(next, true);

    // Relative paths only, so a crafted `next` cannot bounce the user off-site.
    const destination = new URL(next.startsWith('/') ? next : '/', request.url);
    const response = NextResponse.redirect(destination, 303);
    response.cookies.set(COOKIE_NAME, expected, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
    return response;
  }

  if (request.cookies.get(COOKIE_NAME)?.value === expected) return NextResponse.next();

  // The page fetches these, so answer in the shape its error handling expects.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return loginPage(pathname === LOGIN_PATH ? '/' : `${pathname}${search}`, false);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
