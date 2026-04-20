import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Add more paths here if they are public
  const publicPaths = ['/login', '/unauthorized', '/signup'];
  const isPublicRoute = publicPaths.some(path => request.nextUrl.pathname.startsWith(path));

  if (!isPublicRoute) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    
    // Check if user is in allowlist
    const allowedUsersStr = process.env.ALLOWED_USERS || '';
    const allowedUsers = allowedUsersStr.split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
    
    // If allowlist is configured and user is not in it, redirect to unauthorized
    if (allowedUsers.length > 0 && !allowedUsers.includes(user.email?.toLowerCase() || '')) {
      const url = request.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
    }
  } else if (user && request.nextUrl.pathname.startsWith('/login')) {
    // Redirect authenticated users away from login page
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
