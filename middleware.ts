export { auth as middleware } from '@/auth'

export const config = {
  // Protect all routes except: auth API, static files, login page
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon\\.ico|login|unauthorized).*)',
  ],
}
