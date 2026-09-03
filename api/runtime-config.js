module.exports = (request, response) => {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ success: false, error: { message: 'Method not allowed.' } });
    return;
  }

  const apiUrl = process.env.VENDOR_API_URL || 'http://localhost:4000';
  const supabaseUrl = process.env.VENDOR_SUPABASE_URL || 'https://fuqrhfxptybipxbzveyy.supabase.co';
  const supabaseAnonKey = process.env.VENDOR_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1cXJoZnhwdHliaXB4Ynp2ZXl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDY3MjYsImV4cCI6MjEwMzUyMjcyNn0.Q240FBpikqiWaGytkVP1RWVHGA-ZpvdVicY9qf4pvWw';

  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.status(200).json({
    success: true,
    data: {
      apiUrl,
      supabaseUrl,
      supabaseAnonKey,
    },
  });
};
