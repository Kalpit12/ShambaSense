-- Potatoes and cabbage join the photo checks: three new causes. Black rot and aphids, already in
-- the list, are used for cabbage too. Kiswahili names need review by a native speaker.
insert into public.causes (id, crop, latin_name, name_en, name_sw, category) values
  ('potato_blight', 'potatoes', 'Phytophthora infestans', 'Potato late blight', 'Ukungu wa viazi', 'disease'),
  ('potato_wilt', 'potatoes', 'Ralstonia solanacearum', 'Bacterial wilt of potato', 'Mnyauko bakteria wa viazi', 'disease'),
  ('diamondback', 'cabbage', 'Plutella xylostella', 'Diamondback moth', 'Nondo almasi (DBM)', 'pest')
on conflict (id) do nothing;
