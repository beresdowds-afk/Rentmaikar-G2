
REVOKE ALL ON FUNCTION public._match_broadcast(public.driver_vehicle_matches, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.driver_accreditation_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_assign_driver_to_vehicle(uuid, uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_initiate_match_agreement(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_match_agreement_signed(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_accredit_match(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_match_picked_up(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cancel_match(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.driver_accreditation_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_driver_to_vehicle(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_initiate_match_agreement(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_match_agreement_signed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_accredit_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_match_picked_up(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_match(uuid, text) TO authenticated;
