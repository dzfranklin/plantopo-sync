import { register } from "prom-client/";

export default async function handleMetrics(
  _req: Request,
  _info: Deno.ServeHandlerInfo,
  _url: URL
): Promise<Response> {
  const metrics = await register.metrics();
  return new Response(metrics, { status: 200 });
}
