import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase
    .from('category_metrics')
    .insert([
      {
        upload_date: '2026-06-01',
        category: 'Test',
        platform: 'combined',
        views: 10,
        cart_adds: 5,
        purchases: 2,
        fis_users: 1,
        pdp_to_cart_rate: 0.5,
        overall_conv_rate: 0.2,
        fis_intent_rate: 0.1
      }
    ]);
  console.log("Error:", error);
}
test();
