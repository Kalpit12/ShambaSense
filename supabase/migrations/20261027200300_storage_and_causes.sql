-- Private photo bucket. Each farmer writes under a folder named by their user id:
-- check-photos/<user id>/<check id>.jpg. Signed URLs only; nothing is public (architecture.md §9).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('check-photos', 'check-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "farmer uploads own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'check-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "farmer reads own photos" on storage.objects for select to authenticated
  using (bucket_id = 'check-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "linked orgs read photos" on storage.objects for select to authenticated
  using (bucket_id = 'check-photos' and public.org_sees_farmer(((storage.foldername(name))[1])::uuid));

-- The closed cause list (§5.4). Kiswahili names need review by a native speaker.
insert into public.causes (id, crop, latin_name, name_en, name_sw, category) values
  ('early_blight', 'tomatoes', 'Alternaria solani', 'Early blight', 'Kuoza kwa majani', 'disease'),
  ('late_blight', 'tomatoes', 'Phytophthora infestans', 'Late blight', 'Ukungu wa nyanya', 'disease'),
  ('septoria', 'tomatoes', 'Septoria lycopersici', 'Septoria leaf spot', 'Madoa madogo ya majani', 'disease'),
  ('tuta', 'tomatoes', 'Tuta absoluta', 'Tomato leaf miner (Tuta)', 'Kipekecha majani ya nyanya (Tuta)', 'pest'),
  ('bacterial_wilt', 'tomatoes', 'Ralstonia solanacearum', 'Bacterial wilt', 'Mnyauko bakteria', 'disease'),
  ('fall_armyworm', 'maize', 'Spodoptera frugiperda', 'Fall armyworm', 'Viwavi jeshi vamizi', 'pest'),
  ('maize_streak', 'maize', null, 'Maize streak virus', 'Ugonjwa wa michirizi ya mahindi', 'disease'),
  ('mln', 'maize', null, 'Maize lethal necrosis', 'Ugonjwa hatari wa mahindi (MLN)', 'disease'),
  ('bean_rust', 'beans', 'Uromyces appendiculatus', 'Bean rust', 'Kutu ya maharagwe', 'disease'),
  ('angular_leaf_spot', 'beans', null, 'Angular leaf spot', 'Madoa ya pembe kwenye majani', 'disease'),
  ('black_rot', 'kale', 'Xanthomonas campestris', 'Black rot', 'Kuoza mweusi', 'disease'),
  ('aphids', 'any', null, 'Aphids', 'Vidukari', 'pest'),
  ('nitrogen', 'any', null, 'Nitrogen shortage', 'Upungufu wa naitrojeni', 'nutrient'),
  ('water_stress', 'any', null, 'Water stress', 'Ukosefu wa maji', 'abiotic')
on conflict (id) do nothing;
