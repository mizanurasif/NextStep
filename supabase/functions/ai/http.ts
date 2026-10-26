// An error that becomes a JSON response with its status, so handlers can just throw
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// The app is native and doesn't need CORS, but the web build does
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
