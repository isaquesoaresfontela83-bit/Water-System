import { isTrustedMutation } from "@/lib/request-security";
import { selectOne, selectRows, updateRows } from "@/lib/supabase";
import { requirePlatformAdmin } from "@/lib/tenant";
import { handleConsultationAdmin } from "../../../../../../features/individual-plan/booking.mjs";

const services = { requireAdmin: requirePlatformAdmin, isTrustedMutation, selectRows, selectOne, updateRows };
export function GET(request) { return handleConsultationAdmin(request, services); }
export function PATCH(request) { return handleConsultationAdmin(request, services); }
