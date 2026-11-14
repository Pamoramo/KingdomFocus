// Public Supabase settings for this deployment. The anon key is designed to be public: it is shipped
// to every browser, and Row Level Security limits each account to its own rows. Never put the
// service_role key here. Environment variables (.env.local / Vercel) override these values.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dqvmkmwbeshxkmuxwxkn.supabase.co';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdm1rbXdiZXNoeGttdXh3eGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2MDY2NTMsImV4cCI6MjExMDE4MjY1M30.mL-ZpEY-dsozMosnLpanQFTdKFPjNZNEaMF6t9uyp4U';
