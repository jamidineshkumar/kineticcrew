insert into public.crew_referral_codes(user_id,code)
select p.auth_id,'KC-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,16))
from public.crew_profiles p
where p.approval_status='approved'
on conflict(user_id) do nothing;