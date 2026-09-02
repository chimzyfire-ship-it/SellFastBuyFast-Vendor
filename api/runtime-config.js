module.exports = (request, response) => {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ success: false, error: { message: 'Method not allowed.' } });
    return;
  }

  const { VENDOR_API_URL, VENDOR_SUPABASE_URL, VENDOR_SUPABASE_ANON_KEY } = process.env;
  if (!VENDOR_API_URL || !VENDOR_SUPABASE_URL || !VENDOR_SUPABASE_ANON_KEY) {
    response.status(503).json({
      success: false,
      error: { message: 'Vendor runtime configuration is incomplete.' },
    });
    return;
  }

  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.status(200).json({
    success: true,
    data: {
      apiUrl: VENDOR_API_URL,
      supabaseUrl: VENDOR_SUPABASE_URL,
      supabaseAnonKey: VENDOR_SUPABASE_ANON_KEY,
    },
  });
};
