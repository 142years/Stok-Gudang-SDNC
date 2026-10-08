// Konfigurasi — ubah URL/Key Supabase dan PIN staff di file ini
// Konfigurasi Supabase (Ganti dengan URL & Anon Key dari Project Supabase Anda)
const SUPABASE_URL = 'https://mzgieucddbplyjsbklep.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16Z2lldWNkZGJwbHlqc2JrbGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzA4OTQsImV4cCI6MjEwNTY0Njg5NH0.Gw4UWJLaIr7_FPaJbbpXoSW9jQBfB4mAG1aMZ5BKFyo';
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const STAFF_PIN = '142';
