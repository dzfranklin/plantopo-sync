export function errorResponse(
  status: number,
  message: string
): Promise<Response> {
  return Promise.resolve(new Response(message, { status }));
}

export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}
