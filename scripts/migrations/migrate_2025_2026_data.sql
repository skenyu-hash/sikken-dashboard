-- SIKKEN Dashboard 過去データ一括投入 + 救済
-- 生成日: 2026-05-03
-- 投入レコード数: 33 (UPSERT) + 既決救済2件 + DELETE 6件

BEGIN;

-- ============================================
-- (1) 過去データ UPSERT (水道+電気+鍵)
-- ============================================
INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kansai', 'water', 2025, 11, 30,
   55364095, 15500677, 446, 124135,
   7027434, 0.127, 417, 16852,
   816, 8612, 0.51, 0.28,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kansai', 'water', 2025, 12, 31,
   49740886, 15190122, 456, 109081,
   7269151, 0.146, 411, 17686,
   689, 10550, 0.6, 0.31,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kansai', 'water', 2026, 1, 31,
   55106296, 16638214, 514, 107211,
   8144417, 0.148, 497, 16387,
   881, 9245, 0.56, 0.3,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kanto', 'water', 2025, 11, 30,
   104562130, 20529515, 890, 117486,
   26874318, 0.257, 732, 36714,
   1358, 19790, 0.539, 0.196,
   43773780, 57, 767961, 15)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kanto', 'water', 2025, 12, 31,
   98632115, 26847864, 843, 117001,
   24287224, 0.246, 710, 34207,
   1303, 18639, 0.545, 0.272,
   38687400, 51, 758576, 15)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kanto', 'water', 2026, 1, 31,
   85812620, 20554705, 849, 101075,
   25123243, 0.293, 739, 33996,
   1312, 19149, 0.563, 0.24,
   31290520, 53, 590387, 15)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kanto', 'water', 2026, 2, 28,
   82530280, 20862339, 746, 110630,
   22699197, 0.275, 661, 34341,
   1211, 18744, 0.546, 0.253,
   29862800, 34, 878318, 14)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kitakanto', 'water', 2025, 11, 30,
   18933600, 4532576, 145, 130577,
   4093175, 0.216, 124, 33009,
   198, 20673, 0.626, 0.239,
   4353000, 3, 1451000, 4)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kitakanto', 'water', 2025, 12, 31,
   18849770, 6051004, 113, 166812,
   4170283, 0.221, 112, 37235,
   183, 22788, 0.612, 0.321,
   6636000, 3, 2212000, 3)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kitakanto', 'water', 2026, 1, 31,
   10759650, 1491210, 121, 88923,
   4898297, 0.455, 128, 38268,
   225, 21770, 0.569, 0.139,
   3608000, 4, 902000, 3)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kitakanto', 'water', 2026, 2, 28,
   19307600, 5093376, 118, 163624,
   5279345, 0.273, 120, 43995,
   214, 24670, 0.561, 0.264,
   6922000, 6, 1153667, 3)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('nagoya', 'water', 2025, 11, 30,
   58472171, 12583859, 659, 88729,
   18260616, 0.312, 608, 30034,
   985, 18539, 0.62, 0.22,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('nagoya', 'water', 2025, 12, 31,
   67941011, 23218438, 563, 120677,
   12427771, 0.183, 470, 26442,
   700, 17754, 0.67, 0.34,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('nagoya', 'water', 2026, 1, 31,
   63629600, 19919649, 529, 120283,
   13499757, 0.212, 436, 30963,
   682, 19794, 0.64, 0.31,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('hokkaido', 'water', 2025, 11, 30,
   47594278, 14844244, 313, 152058,
   9033246, 0.19, 284, 31807,
   452, 19985, 0.63, 0.31,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('hokkaido', 'water', 2025, 12, 31,
   35119784, 9559115, 301, 116677,
   7484210, 0.213, 236, 31713,
   448, 16706, 0.53, 0.27,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('hokkaido', 'water', 2026, 1, 31,
   38032480, 9333554, 292, 130248,
   7898933, 0.208, 278, 28413,
   516, 15308, 0.54, 0.25,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('chugoku', 'water', 2025, 11, 30,
   11447220, 201816, 194, 59006,
   6492862, 0.567, 179, 36273,
   273, 23783, 0.66, 0.02,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('chugoku', 'water', 2025, 12, 31,
   16671547, 5452609, 166, 100431,
   4367884, 0.262, 141, 30978,
   207, 21101, 0.68, 0.33,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('chugoku', 'water', 2026, 1, 31,
   11670700, 4523868, 118, 98904,
   2898630, 0.248, 107, 27090,
   141, 20558, 0.76, 0.39,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kyushu', 'water', 2025, 11, 30,
   33004030, 5835824, 362, 91171,
   11405416, 0.346, 345, 33059,
   668, 17074, 0.52, 0.18,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kyushu', 'water', 2025, 12, 31,
   37548425, 10976046, 396, 94819,
   10134126, 0.27, 369, 27464,
   634, 15984, 0.58, 0.29,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kyushu', 'water', 2026, 1, 31,
   29975680, 8733858, 342, 87648,
   9645448, 0.322, 314, 30718,
   502, 19214, 0.63, 0.29,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kansai', 'electric', 2025, 11, 30,
   80017420, 14493195, 680, 117673,
   23113292, 0.289, 626, 36922,
   1105, 20917, 0.57, 0.18,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kansai', 'electric', 2025, 12, 31,
   77107741, 18179272, 683, 112896,
   19791350, 0.257, 612, 32339,
   1091, 18141, 0.56, 0.24,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kansai', 'electric', 2026, 1, 31,
   77860915, 19362926, 641, 121468,
   19803784, 0.254, 560, 35364,
   996, 19883, 0.56, 0.25,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kanto', 'electric', 2025, 11, 30,
   22939040, 4551281, 228, 100610,
   4603809, 0.201, 223, 20645,
   547, 8416, 0.41, 0.2,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kanto', 'electric', 2025, 12, 31,
   19122100, 4668528, 177, 108034,
   3244367, 0.17, 159, 20405,
   313, 10365, 0.51, 0.24,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kanto', 'electric', 2026, 1, 31,
   25104750, 5366864, 182, 137938,
   4026824, 0.16, 180, 22371,
   386, 10432, 0.47, 0.21,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kansai', 'locksmith', 2025, 11, 30,
   12724718, 11176833, 309, 41180,
   8362019, 0.657, 453, 18459,
   962, 8692, 0.47, 0.88,
   0, 0, 0, 4)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kansai', 'locksmith', 2025, 12, 31,
   11574045, 9881974, 263, 44008,
   7081667, 0.612, 433, 16355,
   962, 7361, 0.45, 0.85,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kansai', 'locksmith', 2026, 1, 31,
   10100686, 8616621, 309, 32688,
   5281623, 0.523, 309, 17093,
   572, 9234, 0.54, 0.85,
   0, 0, 0, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

INSERT INTO monthly_summaries
  (area_id, business_category, year, month, as_of_day,
   total_revenue, total_profit, total_count, unit_price,
   ad_cost, ad_rate, acquisition_count, cpa,
   call_count, call_unit_price, conv_rate, profit_rate,
   help_revenue, help_count, help_unit_price, vehicle_count)
VALUES
  ('kansai', 'locksmith', 2026, 2, 28,
   14108182, 12059818, 243, 58058,
   5485716, 0.389, 346, 15855,
   601, 9128, 0.58, 0.85,
   679745, 2, 339873, 0)
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  as_of_day = EXCLUDED.as_of_day,
  total_revenue = EXCLUDED.total_revenue,
  total_profit = EXCLUDED.total_profit,
  total_count = EXCLUDED.total_count,
  unit_price = EXCLUDED.unit_price,
  ad_cost = EXCLUDED.ad_cost,
  ad_rate = EXCLUDED.ad_rate,
  acquisition_count = EXCLUDED.acquisition_count,
  cpa = EXCLUDED.cpa,
  call_count = EXCLUDED.call_count,
  call_unit_price = EXCLUDED.call_unit_price,
  conv_rate = EXCLUDED.conv_rate,
  profit_rate = EXCLUDED.profit_rate,
  help_revenue = EXCLUDED.help_revenue,
  help_count = EXCLUDED.help_count,
  help_unit_price = EXCLUDED.help_unit_price,
  vehicle_count = EXCLUDED.vehicle_count;

-- ============================================
-- (2) 既決救済: 鍵関西 / ロード関西 2026-04
-- ============================================
UPDATE monthly_summaries
SET total_revenue = 14221141,
    total_profit  = 6573180,
    cpa           = 16144,
    profit_rate   = 0.462,
    conv_rate     = 0.56,
    unit_price    = 34350
WHERE area_id='kansai' AND business_category='locksmith'
  AND year=2026 AND month=4;

UPDATE monthly_summaries
SET total_revenue = 15107270,
    total_profit  = 9068858,
    cpa           = 21746,
    profit_rate   = 0.600,
    conv_rate     = 0.364,
    unit_price    = 55953
WHERE area_id='kansai' AND business_category='road'
  AND year=2026 AND month=4;

-- ============================================
-- (3) DELETE: 名古屋探偵 全月 + 名古屋水道 2026-02/03 (ゴミレコード)
-- ============================================
DELETE FROM monthly_summaries
WHERE area_id='nagoya' AND business_category='detective'
  AND ((year=2025 AND month=12) OR (year=2026 AND month BETWEEN 1 AND 3));

DELETE FROM monthly_summaries
WHERE area_id='nagoya' AND business_category='water'
  AND year=2026 AND month IN (2, 3);

-- ============================================
-- (4) 検証クエリ - COMMIT前に確認
-- ============================================
SELECT business_category, area_id, year, month, 
       total_revenue, total_profit, total_count, ad_cost
FROM monthly_summaries
WHERE (year=2025 AND month IN (11,12)) OR (year=2026 AND month IN (1,2,4))
ORDER BY business_category, area_id, year, month;

SELECT '異常レコード再確認' AS label, COUNT(*) AS cnt
FROM monthly_summaries
WHERE total_count > 0 AND total_revenue = 0;
-- 期待: 0件

-- 問題なければ:
COMMIT;
-- 問題あれば:
-- ROLLBACK;